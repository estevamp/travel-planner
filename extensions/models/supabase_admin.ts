/**
 * Read-only Supabase project and database checks over the Supabase Management
 * API (HTTPS/443).
 *
 * Built for environments where outbound Postgres ports (5432/6543) are blocked
 * by network policy — every operation here travels over HTTPS to
 * `api.supabase.com` instead of a direct database connection.
 *
 * Safety posture: this model never accepts caller-supplied SQL. Every method
 * issues a fixed, catalog-only query built into this file. No table rows are
 * read, and nothing is created, altered, or dropped.
 *
 * @module
 */
import { z } from "npm:zod@4";

/** Global arguments shared by every method on this model. */
const GlobalArgsSchema = z.object({
  projectRef: z
    .string()
    .regex(/^[a-z0-9]{16,32}$/, "projectRef must be the 20-char Supabase project ref")
    .describe("Supabase project ref, e.g. the subdomain of <ref>.supabase.co"),
  accessToken: z
    .string()
    .min(20)
    .meta({ sensitive: true })
    .describe(
      'Supabase personal access token (sbp_...). Supply via vault: ${{ vault.get("<vault>", "SUPABASE_ACCESS_TOKEN") }}',
    ),
  apiBaseUrl: z
    .string()
    .url()
    .default("https://api.supabase.com")
    .describe("Supabase Management API base URL"),
  requestTimeoutMs: z
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(30000)
    .describe("Per-request HTTP timeout in milliseconds"),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Minimal logger surface used by this model. */
interface Logger {
  info: (msg: string, props?: Record<string, unknown>) => void;
  warning: (msg: string, props?: Record<string, unknown>) => void;
}

/** Context fields this model's methods rely on. */
interface ModelContext {
  globalArgs: GlobalArgs;
  signal?: AbortSignal;
  logger: Logger;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
}

/** Project metadata as reported by the Management API. */
const ProjectSchema = z.object({
  id: z.string(),
  ref: z.string(),
  name: z.string(),
  region: z.string(),
  status: z.string(),
  createdAt: z.string(),
  organizationId: z.string(),
  databaseHost: z.string(),
  databaseVersion: z.string(),
}).passthrough();

/** Per-service health as reported by the Management API. */
const HealthSchema = z.object({
  service: z.string(),
  healthy: z.boolean(),
  status: z.string(),
  error: z.string(),
}).passthrough();

/** A single user table discovered in the database catalog. */
const TableSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  owner: z.string(),
  rlsEnabled: z.boolean(),
  approxRows: z.number(),
  totalBytes: z.number(),
  indexCount: z.number(),
}).passthrough();

/** RLS posture for one table in an exposed schema. */
const RlsSchema = z.object({
  schemaName: z.string(),
  tableName: z.string(),
  rlsEnabled: z.boolean(),
  rlsForced: z.boolean(),
  policyCount: z.number(),
  managed: z.boolean(),
  severity: z.string(),
  finding: z.string(),
}).passthrough();

/**
 * Schemas owned by Supabase rather than the application.
 *
 * Tables here routinely run with RLS enabled and zero policies — that is the
 * intended deny-all posture, since Supabase's own services reach them via the
 * service role, which bypasses RLS. Flagging them as problems is noise, so they
 * are reported at `info` severity instead.
 */
const MANAGED_SCHEMAS: ReadonlySet<string> = new Set([
  "auth",
  "cron",
  "extensions",
  "graphql",
  "graphql_public",
  "net",
  "pgsodium",
  "pgsodium_masks",
  "realtime",
  "storage",
  "supabase_functions",
  "supabase_migrations",
  "vault",
]);

/** Severity plus explanation for one table's RLS posture. */
interface RlsVerdict {
  severity: "critical" | "warning" | "info" | "ok";
  finding: string;
}

/**
 * Classify a table's RLS posture, accounting for who owns the schema.
 *
 * An application table without RLS is a data-exposure bug: the anon key is
 * public, so PostgREST will serve every row. The same shape on a
 * Supabase-managed table is expected and is reported as `info`.
 */
function classifyRls(
  schemaName: string,
  rlsEnabled: boolean,
  policyCount: number,
): RlsVerdict {
  const managed = MANAGED_SCHEMAS.has(schemaName);
  if (!rlsEnabled) {
    return managed
      ? {
        severity: "warning",
        finding:
          "RLS disabled on a Supabase-managed table — unexpected; verify recent migrations",
      }
      : {
        severity: "critical",
        finding: "RLS disabled — every row is readable through the public anon key",
      };
  }
  if (policyCount === 0) {
    return managed
      ? {
        severity: "info",
        finding:
          "RLS enabled with no policies — expected for Supabase-managed tables (deny-all; " +
          "service role bypasses RLS)",
      }
      : {
        severity: "warning",
        finding: "RLS enabled but no policies — all client access is denied",
      };
  }
  return { severity: "ok", finding: `RLS enabled with ${policyCount} policy(ies)` };
}

/** An installed Postgres extension. */
const PgExtensionSchema = z.object({
  name: z.string(),
  installedVersion: z.string(),
  defaultVersion: z.string(),
  schemaName: z.string(),
  outdated: z.boolean(),
}).passthrough();

/** Fixed, catalog-only SQL. No caller input is ever interpolated. */
const SQL = {
  tables: `
    select n.nspname                                             as schema_name,
           c.relname                                             as table_name,
           pg_get_userbyid(c.relowner)                           as owner,
           c.relrowsecurity                                      as rls_enabled,
           greatest(c.reltuples, 0)::bigint                      as approx_rows,
           pg_total_relation_size(c.oid)                         as total_bytes,
           (select count(*) from pg_index i where i.indrelid = c.oid) as index_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
       and n.nspname not like 'pg_temp%'
       and n.nspname not like 'pg_toast_temp%'
     order by n.nspname, c.relname
  `,
  rls: `
    select n.nspname            as schema_name,
           c.relname            as table_name,
           c.relrowsecurity     as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r'
       and n.nspname in ('public', 'storage')
     order by n.nspname, c.relname
  `,
  extensions: `
    select e.extname     as name,
           e.extversion  as installed_version,
           n.nspname     as schema_name,
           a.default_version
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      left join pg_available_extensions a on a.name = e.extname
     order by e.extname
  `,
} as const;

/** Coerce a Postgres bigint/numeric (JSON string or number) to a number. */
function toNumber(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Coerce a Postgres boolean (JSON bool or 't'/'f' string) to a boolean. */
function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "t" || value === "true";
  return false;
}

/** Build a slug safe for use as a data instance name. */
function slug(...parts: string[]): string {
  return parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Call the Supabase Management API and return the parsed JSON body.
 *
 * Throws on any non-2xx response, with the token redacted from the message.
 */
async function callApi(
  ctx: ModelContext,
  path: string,
  init?: { method?: string; body?: string },
): Promise<unknown> {
  const { apiBaseUrl, accessToken, requestTimeoutMs } = ctx.globalArgs;
  const url = `${apiBaseUrl.replace(/\/+$/, "")}${path}`;
  const timeout = AbortSignal.timeout(requestTimeoutMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: init?.body,
      signal,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Request to ${url} failed: ${reason}`);
  }

  const text = await response.text();
  if (!response.ok) {
    const detail = text.slice(0, 400).replace(accessToken, "[REDACTED]");
    throw new Error(
      `Supabase Management API ${response.status} ${response.statusText} for ${path}: ${detail}`,
    );
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Supabase Management API returned non-JSON body for ${path}`);
  }
}

/** Run one of the built-in catalog queries and return the result rows. */
async function runCatalogQuery(
  ctx: ModelContext,
  query: string,
): Promise<Array<Record<string, unknown>>> {
  const ref = ctx.globalArgs.projectRef;
  const result = await callApi(ctx, `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object") {
    const rows = (result as { result?: unknown }).result;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  throw new Error("Unexpected response shape from database/query — expected an array of rows");
}

/** Model definition: read-only Supabase project and database checks over HTTPS. */
export const model = {
  type: "@estevamp/supabase-admin",
  version: "2026.08.06.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    project: {
      description: "Supabase project metadata (region, status, database version)",
      schema: ProjectSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    health: {
      description: "Per-service health for the project (db, auth, rest, realtime, storage)",
      schema: HealthSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    table: {
      description: "One user table from the database catalog",
      schema: TableSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    rls: {
      description: "Row-level-security posture for one table in an exposed schema",
      schema: RlsSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
    pgExtension: {
      description: "One installed Postgres extension",
      schema: PgExtensionSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  checks: {
    reachable: {
      description: "Verify the Management API is reachable and the token authorizes this project",
      labels: ["live"],
      execute: async (
        context: { globalArgs: GlobalArgs; signal?: AbortSignal; logger: Logger },
      ): Promise<{ pass: boolean; errors?: string[] }> => {
        try {
          await callApi(
            context as ModelContext,
            `/v1/projects/${context.globalArgs.projectRef}`,
          );
          return { pass: true };
        } catch (cause) {
          const reason = cause instanceof Error ? cause.message : String(cause);
          return { pass: false, errors: [reason] };
        }
      },
    },
  },
  methods: {
    project_get: {
      description:
        "Fetch project metadata: region, status, database host and version. Read-only.",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: ModelContext,
      ): Promise<{ dataHandles: Array<{ name: string }> }> => {
        const ref = context.globalArgs.projectRef;
        const raw = await callApi(context, `/v1/projects/${ref}`) as Record<string, unknown>;
        const db = (raw.database ?? {}) as Record<string, unknown>;
        const handle = await context.writeResource("project", `project-${ref}`, {
          id: String(raw.id ?? ref),
          ref: String(raw.ref ?? ref),
          name: String(raw.name ?? ""),
          region: String(raw.region ?? ""),
          status: String(raw.status ?? ""),
          createdAt: String(raw.created_at ?? ""),
          organizationId: String(raw.organization_id ?? ""),
          databaseHost: String(db.host ?? ""),
          databaseVersion: String(db.version ?? ""),
        });
        context.logger.info("Project {ref} status {status}", {
          ref,
          status: String(raw.status ?? "unknown"),
        });
        return { dataHandles: [handle] };
      },
    },
    health_check: {
      description:
        "Report per-service health for the project (factory: one `health` per service). Read-only.",
      arguments: z.object({
        services: z
          .array(z.enum(["auth", "db", "pooler", "realtime", "rest", "storage"]))
          .default(["db", "auth", "rest", "realtime", "storage"])
          .describe("Which services to query"),
      }),
      execute: async (
        args: { services: Array<"auth" | "db" | "pooler" | "realtime" | "rest" | "storage"> },
        context: ModelContext,
      ): Promise<{ dataHandles: Array<{ name: string }> }> => {
        const ref = context.globalArgs.projectRef;
        const query = args.services.join(",");
        const raw = await callApi(
          context,
          `/v1/projects/${ref}/health?services=${encodeURIComponent(query)}`,
        );
        const entries = Array.isArray(raw) ? raw as Array<Record<string, unknown>> : [];
        const handles: Array<{ name: string }> = [];
        for (const entry of entries) {
          const service = String(entry.name ?? entry.service ?? "unknown");
          const healthy = String(entry.status ?? "").toUpperCase() === "ACTIVE_HEALTHY" ||
            toBoolean(entry.healthy);
          handles.push(
            await context.writeResource("health", slug("health", ref, service), {
              service,
              healthy,
              status: String(entry.status ?? ""),
              error: String(entry.error ?? ""),
            }),
          );
          if (!healthy) {
            context.logger.warning("Service {service} is not healthy: {status}", {
              service,
              status: String(entry.status ?? "unknown"),
            });
          }
        }
        return { dataHandles: handles };
      },
    },
    table_list: {
      description:
        "List user tables with owner, size, approximate row count and index count " +
        "(factory: one `table` per table). Catalog only — never reads table rows.",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: ModelContext,
      ): Promise<{ dataHandles: Array<{ name: string }> }> => {
        const rows = await runCatalogQuery(context, SQL.tables);
        const handles: Array<{ name: string }> = [];
        for (const row of rows) {
          const schemaName = String(row.schema_name ?? "");
          const tableName = String(row.table_name ?? "");
          handles.push(
            await context.writeResource(
              "table",
              slug("table", schemaName, tableName),
              {
                schemaName,
                tableName,
                owner: String(row.owner ?? ""),
                rlsEnabled: toBoolean(row.rls_enabled),
                approxRows: toNumber(row.approx_rows),
                totalBytes: toNumber(row.total_bytes),
                indexCount: toNumber(row.index_count),
              },
            ),
          );
        }
        context.logger.info("Found {count} user tables", { count: handles.length });
        return { dataHandles: handles };
      },
    },
    rls_audit: {
      description:
        "Audit row-level security on tables reachable through the public API " +
        "(public, storage): flags application tables with RLS disabled or " +
        "enabled-but-policyless, and reports Supabase-managed tables at `info` " +
        "(factory: one `rls` per table). Catalog only.",
      arguments: z.object({
        onlyFindings: z
          .boolean()
          .default(false)
          .describe(
            "Write only tables needing attention — skips `ok` and the expected " +
              "`info` posture on Supabase-managed schemas",
          ),
      }),
      execute: async (
        args: { onlyFindings: boolean },
        context: ModelContext,
      ): Promise<{ dataHandles: Array<{ name: string }> }> => {
        const rows = await runCatalogQuery(context, SQL.rls);
        const handles: Array<{ name: string }> = [];
        let critical = 0;
        let warnings = 0;
        for (const row of rows) {
          const schemaName = String(row.schema_name ?? "");
          const tableName = String(row.table_name ?? "");
          const rlsEnabled = toBoolean(row.rls_enabled);
          const policyCount = toNumber(row.policy_count);
          const { severity, finding } = classifyRls(schemaName, rlsEnabled, policyCount);

          if (severity === "critical") critical++;
          if (severity === "warning") warnings++;
          if (args.onlyFindings && (severity === "ok" || severity === "info")) continue;

          handles.push(
            await context.writeResource(
              "rls",
              slug("rls", schemaName, tableName),
              {
                schemaName,
                tableName,
                rlsEnabled,
                rlsForced: toBoolean(row.rls_forced),
                policyCount,
                managed: MANAGED_SCHEMAS.has(schemaName),
                severity,
                finding,
              },
            ),
          );
        }
        if (critical > 0) {
          context.logger.warning(
            "{count} application table(s) have RLS disabled — rows are publicly readable",
            { count: critical },
          );
        }
        context.logger.info(
          "Audited {total} table(s): {critical} critical, {warnings} warning",
          { total: rows.length, critical, warnings },
        );
        return { dataHandles: handles };
      },
    },
    extension_list: {
      description:
        "List installed Postgres extensions and flag ones behind their default " +
        "version (factory: one `pgExtension` per extension). Catalog only.",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: ModelContext,
      ): Promise<{ dataHandles: Array<{ name: string }> }> => {
        const rows = await runCatalogQuery(context, SQL.extensions);
        const handles: Array<{ name: string }> = [];
        for (const row of rows) {
          const name = String(row.name ?? "");
          const installedVersion = String(row.installed_version ?? "");
          const defaultVersion = String(row.default_version ?? "");
          handles.push(
            await context.writeResource("pgExtension", slug("ext", name), {
              name,
              installedVersion,
              defaultVersion,
              schemaName: String(row.schema_name ?? ""),
              outdated: defaultVersion.length > 0 && defaultVersion !== installedVersion,
            }),
          );
        }
        context.logger.info("Found {count} installed extensions", { count: handles.length });
        return { dataHandles: handles };
      },
    },
  },
};
