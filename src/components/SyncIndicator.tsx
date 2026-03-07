/**
 * SyncIndicator
 * -------------
 * Chip discreto que aparece quando há operações offline pendentes ou
 * quando a sincronização está em andamento.
 *
 * Estados:
 *  - Offline + pendentes  → âmbar  "N alteração(ões) pendente(s)"
 *  - Sincronizando        → azul   "Sincronizando…"
 *  - Tudo sincronizado    → verde  "Sincronizado" (desaparece após 3s)
 */

import { useEffect, useState } from "react";

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
  const prevSyncingRef = useState(false);

  useEffect(() => {
    if (isSyncing) {
      setState("syncing");
      setVisible(true);
      return;
    }

    // Acabou de sincronizar (era syncing, agora não é)
    if (prevSyncingRef[0] && !isSyncing && pendingCount === 0 && isOnline) {
      setState("synced");
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      prevSyncingRef[0] = false;
      return () => clearTimeout(t);
    }

    if (!isOnline && pendingCount > 0) {
      setState("offline_pending");
      setVisible(true);
    } else if (isOnline && pendingCount > 0) {
      // Online mas ainda tem pendentes (flush em andamento logo)
      setState("syncing");
      setVisible(true);
    } else {
      setState("idle");
      setVisible(false);
    }

    if (isSyncing) prevSyncingRef[0] = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount, isSyncing, isOnline]);

  if (!visible || state === "idle") return null;

  const configs: Record<IndicatorState, { bg: string; text: string; icon: string; label: string }> = {
    offline_pending: {
      bg: darkMode ? "bg-amber-900/60 border-amber-700" : "bg-amber-50 border-amber-300",
      text: darkMode ? "text-amber-300" : "text-amber-700",
      icon: "📶",
      label:
        pendingCount === 1
          ? "1 alteração pendente"
          : `${pendingCount} alterações pendentes`,
    },
    syncing: {
      bg: darkMode ? "bg-blue-900/60 border-blue-700" : "bg-blue-50 border-blue-300",
      text: darkMode ? "text-blue-300" : "text-blue-700",
      icon: "🔄",
      label: "Sincronizando…",
    },
    synced: {
      bg: darkMode ? "bg-green-900/60 border-green-700" : "bg-green-50 border-green-300",
      text: darkMode ? "text-green-300" : "text-green-700",
      icon: "✅",
      label: "Sincronizado",
    },
    idle: {
      bg: "",
      text: "",
      icon: "",
      label: "",
    },
  };

  const { bg, text, icon, label } = configs[state];

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
        className={state === "syncing" ? "animate-spin inline-block" : ""}
        style={state === "syncing" ? { display: "inline-block" } : {}}
      >
        {icon}
      </span>
      {label}
    </div>
  );
}