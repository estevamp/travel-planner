#!/usr/bin/env bash
#
# Backup completo do banco Supabase do travel-planner.
#
# Gera três arquivos, na mesma divisão que a Supabase recomenda para restore:
#
#   roles.sql   papéis do cluster (pg_dumpall --roles-only)
#   schema.sql  DDL das suas tabelas/funções/policies (pg_dump --schema-only)
#   data.sql    dados, em formato COPY, incluindo auth.users e storage
#
# Os pipelines pg_dump/sed abaixo foram extraídos de
# `supabase db dump --dry-run` (CLI 2.111.0), então o resultado é idêntico ao do
# CLI — mas sem exigir Docker nem o próprio CLI. Só pg_dump/pg_dumpall.
#
# PRÉ-REQUISITOS
#   - pg_dump e pg_dumpall major >= 17 (o servidor roda Postgres 17.6)
#   - saída TCP liberada na porta 5432 (é exatamente o que a rede do WSL bloqueia,
#     por isso rode isto de uma rede que permita)
#
# USO
#   ./scripts/db-backup.sh                 # via session pooler (IPv4, recomendado)
#   ./scripts/db-backup.sh --direct        # via db.<ref>.supabase.co (exige IPv6)
#   ./scripts/db-backup.sh --out /caminho  # diretório de destino
#
# SENHA — resolvida na primeira fonte disponível:
#   1. swamp vault (travel-planner / SUPABASE_DB_PASSWORD)
#   2. variável de ambiente SUPABASE_DB_PASSWORD
#   3. prompt interativo (entrada oculta)
#
# RESTORE
#   psql "$URL" -f roles.sql
#   psql "$URL" -f schema.sql
#   psql "$URL" -f data.sql
#
set -uo pipefail

PROJECT_REF="oaztuckspjyiyixshkns"
POOLER_HOST="aws-1-sa-east-1.pooler.supabase.com"
DIRECT_HOST="db.${PROJECT_REF}.supabase.co"
VAULT_NAME="travel-planner"
VAULT_KEY="SUPABASE_DB_PASSWORD"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_ROOT="${REPO_ROOT}/backups"
USE_DIRECT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --direct) USE_DIRECT=1; shift ;;
    --out) OUT_ROOT="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "erro: opção desconhecida '$1'" >&2; exit 2 ;;
  esac
done

die() { echo "ERRO: $*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------- pré-flight
step "Verificando pré-requisitos"

command -v pg_dump >/dev/null || die "pg_dump não encontrado. Instale o client do Postgres 17+ (ex.: 'sudo apt install postgresql-client-17' ou 'brew install libpq')."
command -v pg_dumpall >/dev/null || die "pg_dumpall não encontrado (vem no mesmo pacote do pg_dump)."

PGDUMP_MAJOR="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
echo "pg_dump major: ${PGDUMP_MAJOR}"
if [[ "${PGDUMP_MAJOR}" -lt 17 ]]; then
  die "pg_dump ${PGDUMP_MAJOR} é mais antigo que o servidor (17). pg_dump se recusa a dumpar servidor mais novo — instale o client 17+."
fi

if [[ "${USE_DIRECT}" -eq 1 ]]; then
  export PGHOST="${DIRECT_HOST}"
  export PGUSER="postgres"
else
  export PGHOST="${POOLER_HOST}"
  export PGUSER="postgres.${PROJECT_REF}"
fi
export PGPORT="5432"
export PGDATABASE="postgres"
export PGSSLMODE="require"
echo "host: ${PGHOST}:${PGPORT}  usuário: ${PGUSER}"

step "Testando alcance TCP em ${PGHOST}:${PGPORT}"
if ! timeout 15 bash -c "cat < /dev/null > /dev/tcp/${PGHOST}/${PGPORT}" 2>/dev/null; then
  die "não foi possível abrir TCP em ${PGHOST}:${PGPORT}.
     A porta está bloqueada nesta rede (foi o que aconteceu no WSL). Rode de uma
     rede sem esse bloqueio, ou tente '--direct' se você tiver IPv6 funcionando."
fi
echo "porta alcançável."

# ------------------------------------------------------------------- senha
step "Obtendo a senha do banco"
PASSWORD=""
if command -v swamp >/dev/null && swamp vault list-keys "${VAULT_NAME}" --json 2>/dev/null | grep -q "\"${VAULT_KEY}\""; then
  PASSWORD="$(swamp vault read-secret "${VAULT_NAME}" "${VAULT_KEY}" 2>/dev/null || true)"
  [[ -n "${PASSWORD}" ]] && echo "origem: swamp vault (${VAULT_NAME}/${VAULT_KEY})"
fi
if [[ -z "${PASSWORD}" && -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  PASSWORD="${SUPABASE_DB_PASSWORD}"
  echo "origem: variável de ambiente SUPABASE_DB_PASSWORD"
fi
if [[ -z "${PASSWORD}" ]]; then
  read -rsp "Senha do banco Supabase: " PASSWORD
  echo
  echo "origem: prompt"
fi
[[ -n "${PASSWORD}" ]] || die "senha vazia."
# Via PG* env vars não há necessidade de percent-encoding (ao contrário de --db-url).
export PGPASSWORD="${PASSWORD}"
unset PASSWORD

# ------------------------------------------------------------------ destino
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_ROOT}/${STAMP}"
mkdir -p "${OUT_DIR}"
chmod 700 "${OUT_DIR}"
step "Gravando em ${OUT_DIR}"

FAILED=()

# -------------------------------------------------------------------- roles
step "1/3 papéis (pg_dumpall --roles-only)"
if pg_dumpall \
    --roles-only \
    --role "postgres" \
    --quote-all-identifier \
    --no-role-passwords \
    --no-comments \
  | sed -E 's/^\\(un)?restrict .*$/-- &/' \
  | sed -E "s/^CREATE ROLE \"(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)\"/-- &/" \
  | sed -E "s/^ALTER ROLE \"(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)\"/-- &/" \
  | sed -E "s/ (NOSUPERUSER|NOREPLICATION)//g" \
  | sed -E "s/^-- (.* SET \"(pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing)\" .*)/\1/" \
  | sed -E "s/GRANT \".*\" TO \"(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)\"/-- &/" \
  | sed -E "/^--/d" \
  | uniq > "${OUT_DIR}/roles.sql"; then
  echo "RESET ALL;" >> "${OUT_DIR}/roles.sql"
  echo "ok — $(wc -l < "${OUT_DIR}/roles.sql") linhas"
else
  FAILED+=("roles")
  echo "FALHOU (segue para as próximas etapas)" >&2
fi

# ------------------------------------------------------------------- schema
step "2/3 schema (pg_dump --schema-only)"
if pg_dump \
    --schema-only \
    --quote-all-identifier \
    --role "postgres" \
    --exclude-schema "information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault" \
  | sed -E 's/^\\(un)?restrict .*$/-- &/' \
  | sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
  | sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
  | sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
  | sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
  | sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
  | sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
  | sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
  | sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
  | sed -E 's/^         WHEN TAG IN /-- &/' \
  | sed -E 's/^   EXECUTE FUNCTION /-- &/' \
  | sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
  | sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
  | sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
  | sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
  | sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
  | sed -E "s/^GRANT (.+) ON (.+) \"(information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault)\"/-- &/" \
  | sed -E "s/^REVOKE (.+) ON (.+) \"(information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault)\"/-- &/" \
  | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' \
  | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' \
  | sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' \
  | sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
  | sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
  | sed -E 's/^ALTER TABLE "cron"/-- &/' \
  | sed -E 's/^SET transaction_timeout = 0;/-- &/' \
  | sed -E "/^--/d" > "${OUT_DIR}/schema.sql"; then
  echo "ok — $(grep -c 'CREATE TABLE' "${OUT_DIR}/schema.sql" || true) CREATE TABLE"
else
  FAILED+=("schema")
  echo "FALHOU" >&2
fi

# --------------------------------------------------------------------- data
step "3/3 dados (pg_dump --data-only --use-copy)"
{
  echo "SET session_replication_role = replica;"
  echo
} > "${OUT_DIR}/data.sql"
if pg_dump \
    --data-only \
    --quote-all-identifier \
    --role "postgres" \
    --exclude-schema "information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor" \
    --exclude-table "auth.schema_migrations" \
    --exclude-table "storage.migrations" \
    --exclude-table "supabase_functions.migrations" \
    --schema "*" \
  | sed -E 's/^\\(un)?restrict .*$/-- &/' >> "${OUT_DIR}/data.sql"; then
  echo "RESET ALL;" >> "${OUT_DIR}/data.sql"
  COPY_COUNT="$(grep -cE '^COPY ' "${OUT_DIR}/data.sql" || true)"
  echo "ok — ${COPY_COUNT} blocos COPY"
  if [[ "${COPY_COUNT}" -eq 0 ]]; then
    echo "AVISO: nenhum bloco COPY — o dump de dados saiu vazio. Verifique permissões do usuário." >&2
  fi
else
  FAILED+=("data")
  echo "FALHOU" >&2
fi

unset PGPASSWORD

# ------------------------------------------------------------------ resumo
chmod 600 "${OUT_DIR}"/*.sql 2>/dev/null || true

step "Resumo"
ls -lh "${OUT_DIR}" | tail -n +2
echo
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "Etapas que falharam: ${FAILED[*]}" >&2
  echo "O backup está INCOMPLETO." >&2
  exit 1
fi
cat <<EOF
Backup completo em ${OUT_DIR}

Estes arquivos contêm dados pessoais reais (auth.users, profiles, expenses).
Modo 600 aplicado e 'backups/' está no .gitignore — NÃO faça commit deles.

Para restaurar, na ordem:
  psql "\$URL" -f ${OUT_DIR}/roles.sql
  psql "\$URL" -f ${OUT_DIR}/schema.sql
  psql "\$URL" -f ${OUT_DIR}/data.sql
EOF
