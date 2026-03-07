/**
 * Partiu! — Service Worker v2
 * ────────────────────────────
 * Fase 1: cache-first para assets, network-first para Supabase
 * Fase 2: Background Sync — garante flush mesmo após o app fechar e reabrir
 *
 * Compatibilidade:
 *   - Android Chrome: Background Sync nativo via SyncManager
 *   - iOS Safari / outros: fallback via evento "online" no cliente
 */

const CACHE_NAME = "partiu-v2";
const SUPABASE_CACHE = "partiu-supabase-v2";
const SUPABASE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

// Assets do app que devem ser cacheados imediatamente
const PRECACHE_URLS = ["/", "/index.html", "/manifest.json"];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== SUPABASE_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora: não-GET, chrome-extension, links de convite
  if (
    request.method !== "GET" ||
    url.protocol === "chrome-extension:" ||
    url.pathname.startsWith("/invite/")
  ) {
    return;
  }

  // Supabase → Network-first com fallback de cache (TTL 24h)
  if (url.hostname.includes("supabase.co")) {
    event.respondWith(networkFirstSupabase(request));
    return;
  }

  // Assets do app → Cache-first
  event.respondWith(cacheFirstApp(request));
});

async function networkFirstSupabase(request) {
  const cache = await caches.open(SUPABASE_CACHE);
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cloned = response.clone();
      // Guarda com timestamp para controle de TTL
      const headers = new Headers(cloned.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const body = await cloned.arrayBuffer();
      cache.put(request, new Response(body, { status: cloned.status, headers }));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = parseInt(cached.headers.get("sw-cached-at") || "0");
      if (Date.now() - cachedAt < SUPABASE_CACHE_TTL) return cached;
    }
    // Sem cache válido — retorna 503 para o cliente tratar
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirstApp(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // SPA fallback: retorna index.html para qualquer rota não encontrada
    const fallback = await caches.match("/index.html");
    return fallback || new Response("Offline", { status: 503 });
  }
}

// ─── Background Sync ──────────────────────────────────────────────────────────
// Registrado pelo cliente com: navigator.serviceWorker.ready.then(r => r.sync.register("flush-queue"))
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-queue") {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((client) => {
    client.postMessage({ type: "SW_FLUSH_QUEUE" });
  });
}

// ─── Mensagens do cliente ─────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_DONE") {
    // Flush completou — nada a fazer no SW por enquanto
    // (hook para métricas futuras)
  }
});