/**
 * useServiceWorker — v2
 * ─────────────────────
 * Registra o SW e, quando disponível, registra um BackgroundSync tag
 * "flush-queue" para que o SW dispare o flush mesmo após o app fechar.
 *
 * Compatibilidade:
 *   - Android Chrome: SyncManager disponível → Background Sync nativo
 *   - iOS / outros: SyncManager ausente → fallback via evento "online" (no useOfflineQueue)
 */

export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    console.log("[SW] Registrado com sucesso:", registration.scope);

    // Tenta registrar Background Sync para flush offline
    // (disponível apenas no Android Chrome / Chromium)
    if ("SyncManager" in window) {
      try {
        await registration.sync.register("flush-queue");
        console.log("[SW] Background Sync 'flush-queue' registrado");
      } catch (syncErr) {
        // Silencioso — o fallback via evento "online" está no useOfflineQueue
        console.log("[SW] Background Sync não disponível neste browser:", syncErr);
      }
    }

    // Verifica atualizações do SW ao ganhar foco
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        registration.update().catch(() => {});

        // Também re-registra o Background Sync ao retornar ao app
        // (cobre o caso de o app ter ficado em background por longo período)
        if ("SyncManager" in window) {
          registration.sync.register("flush-queue").catch(() => {});
        }
      }
    });
  } catch (err) {
    console.error("[SW] Falha no registro:", err);
  }
}