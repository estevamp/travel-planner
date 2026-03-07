/**
 * SyncIndicator
 * -------------
 * Chip discreto que mostra o estado de sincronização offline.
 *
 * Estados:
 *  - Offline + pendentes  → âmbar  "N alteração(ões) pendente(s)"
 *  - Sincronizando        → azul   "Sincronizando…"
 *  - Tudo sincronizado    → verde  "Sincronizado" (desaparece após 3s)
 */

import { useEffect, useRef, useState } from "react";

interface SyncIndicatorProps {
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  darkMode?: boolean;
}

type IndicatorState = "offline_pending" | "syncing" | "synced" | "idle";

export function SyncIndicator({
  pendingCount,
  isSyncing,
  isOnline,
  darkMode = false,
}: SyncIndicatorProps) {
  const [state, setState] = useState<IndicatorState>("idle");
  const [visible, setVisible] = useState(false);
  const prevSyncingRef = useRef(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Limpa timer anterior
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (isSyncing) {
      setState("syncing");
      setVisible(true);
      prevSyncingRef.current = true;
      return;
    }

    // Acabou de sincronizar com sucesso
    if (prevSyncingRef.current && !isSyncing && pendingCount === 0 && isOnline) {
      prevSyncingRef.current = false;
      setState("synced");
      setVisible(true);
      hideTimerRef.current = setTimeout(() => setVisible(false), 3000);
      return;
    }

    prevSyncingRef.current = false;

    if (!isOnline && pendingCount > 0) {
      setState("offline_pending");
      setVisible(true);
    } else if (isOnline && pendingCount > 0) {
      setState("syncing");
      setVisible(true);
    } else {
      setState("idle");
      setVisible(false);
    }

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [pendingCount, isSyncing, isOnline]);

  if (!visible || state === "idle") return null;

  const configs: Record<
    Exclude<IndicatorState, "idle">,
    { bg: string; text: string; icon: string; label: string }
  > = {
    offline_pending: {
      bg: darkMode
        ? "bg-amber-900/60 border-amber-700"
        : "bg-amber-50 border-amber-300",
      text: darkMode ? "text-amber-300" : "text-amber-700",
      icon: "📶",
      label:
        pendingCount === 1
          ? "1 alteração pendente"
          : `${pendingCount} alterações pendentes`,
    },
    syncing: {
      bg: darkMode
        ? "bg-blue-900/60 border-blue-700"
        : "bg-blue-50 border-blue-300",
      text: darkMode ? "text-blue-300" : "text-blue-700",
      icon: "🔄",
      label: "Sincronizando…",
    },
    synced: {
      bg: darkMode
        ? "bg-green-900/60 border-green-700"
        : "bg-green-50 border-green-300",
      text: darkMode ? "text-green-300" : "text-green-700",
      icon: "✅",
      label: "Sincronizado",
    },
  };

  const { bg, text, icon, label } =
    configs[state as Exclude<IndicatorState, "idle">];

  return (
    <div
      className={`
        fixed bottom-20 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-1.5 px-3 py-1.5 rounded-full border
        text-xs font-medium shadow-md
        transition-all duration-300 ease-out
        ${bg} ${text}
        md:bottom-6 md:left-auto md:right-6 md:translate-x-0
      `}
      role="status"
      aria-live="polite"
    >
      <span
        style={
          state === "syncing"
            ? { display: "inline-block", animation: "spin 1s linear infinite" }
            : {}
        }
      >
        {icon}
      </span>
      {label}
    </div>
  );
}