/**
 * Partiu! — Service Worker v2.1
 * ──────────────────────────────
 * Fix: auth/v1/token agora tem cache próprio para não derrubar operações offline.
 *
 * Estratégia por tipo de URL:
 *   /auth/v1/token   → tenta rede, cacheia sucesso, devolve cache se offline
 *   /rest/v1/**      → network-first com fallback de cache 24h
 *   assets do app    → cache-first
 */

const CACHE_APP      = "partiu-app-v3";
const CACHE_SUPABASE = "partiu-supabase-v3";
const CACHE_AUTH     = "partiu-auth-v3";
const SUPABASE_TTL   = 24 * 60 * 60 * 1000;

const PRECACHE_URLS = ["/", "/index.html", "/manifest.json"];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_APP, CACHE_SUPABASE, CACHE_AUTH].includes(k))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // POST para /auth/v1/token (refresh de sessão) — precisa de tratamento especial
  const isAuthRefresh =
    request.method === "POST" &&
    url.hostname.includes("supabase.co") &&
    url.pathname.includes("/auth/v1/token");

  // Ignora tudo que não é GET, exceto o auth refresh
  if (
    (request.method !== "GET" && !isAuthRefresh) ||
    url.protocol === "chrome-extension:" ||
    url.pathname.startsWith("/invite/")
  ) {
    return;
  }

  if (isAuthRefresh) {
    event.respondWith(handleAuthRefresh(request));
    return;
  }

  if (url.hostname.includes("supabase.co")) {
    event.respondWith(networkFirstSupabase(request));
    return;
  }

  event.respondWith(cacheFirstApp(request));
});

// ─── Auth refresh ─────────────────────────────────────────────────────────────
// Cacheia a última resposta bem-sucedida de refresh.
// Offline: devolve o cache para que o Supabase client não lance exceção
// e o app continue funcionando com a sessão já existente em memória.
async function handleAuthRefresh(request) {
  const cache = await caches.open(CACHE_AUTH);
  // Chave estável — não inclui body que muda a cada request
  const cacheKey = new Request("__auth_session__");

  try {
    const bodyText = await request.clone().text();
    const response = await fetch(new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bodyText,
    }));

    if (response.ok) {
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(cacheKey);
    if (cached) {
      console.log("[SW] Offline: devolvendo sessão de auth cacheada");
      return cached.clone();
    }
    // Sem cache — retorna 200 com body vazio para o client não quebrar
    return new Response(
      JSON.stringify({ access_token: null, error: "offline" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Supabase REST: network-first ─────────────────────────────────────────────
async function networkFirstSupabase(request) {
  const cache = await caches.open(CACHE_SUPABASE);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const body = await response.clone().arrayBuffer();
      cache.put(request, new Response(body, { status: response.status, headers }));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get("sw-cached-at") || "0");
      if (Date.now() - cachedAt < SUPABASE_TTL) return cached;
    }
    return new Response(JSON.stringify({ data: null, error: "offline" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ─── App assets: cache-first ──────────────────────────────────────────────────
async function cacheFirstApp(request) {
  const isNavigationRequest =
    request.mode === "navigate" || request.destination === "document";

  // HTML principal: network-first para evitar index/chunks desatualizados entre deploys
  if (isNavigationRequest) {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_APP);
        cache.put(request, response.clone());
        cache.put("/index.html", response.clone());
      }
      return response;
    } catch {
      const cachedPage = await caches.match(request);
      if (cachedPage) return cachedPage;
      const fallback = await caches.match("/index.html");
      return fallback || new Response("Offline", { status: 503 });
    }
  }

  // Assets estáticos: cache-first
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_APP);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

// ─── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-queue") {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => client.postMessage({ type: "SW_FLUSH_QUEUE" }));
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_DONE") {
    // hook para métricas futuras
  }
});
