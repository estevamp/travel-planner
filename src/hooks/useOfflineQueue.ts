/**
 * useOfflineQueue v1.1
 * ─────────────────────
 * Fix: o flush agora verifica sessão válida antes de executar operações,
 * evitando que o Supabase client tente renovar o token offline e quebre.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OfflineTable = "expenses" | "itinerary" | "ideas" | "documents";
export type OfflineOpType = "insert" | "update" | "delete";

export interface QueuedOperation {
  id: string;
  timestamp: number;
  tripId: string;
  type: OfflineOpType;
  table: OfflineTable;
  payload: Record<string, unknown>;
  optimisticId?: string;
}

interface UseOfflineQueueReturn {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  flush: () => Promise<void>;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "partiu_offline_queue";
const MAX_QUEUE_SIZE = 100;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readQueue(): QueuedOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedOperation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(ops: QueuedOperation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ops));
  } catch {
    console.warn("[OfflineQueue] Falha ao persistir fila");
  }
}

// ─── Verifica se a sessão atual é válida sem fazer request de rede ────────────
// Usa getSession() que lê do storage local — não tenta refresh automático.
async function hasValidSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    // Verifica se o token ainda não expirou (com margem de 60s)
    const expiresAt = data.session.expires_at ?? 0;
    return expiresAt * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [pendingCount, setPendingCount] = useState<number>(() => readQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const flushingRef = useRef(false);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flushQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_FLUSH_QUEUE") {
        void flushQueue();
      }
    };
    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Executa uma operação ──────────────────────────────────────────────────

  async function executeOp(op: QueuedOperation): Promise<{ error: unknown }> {
    switch (op.type) {
      case "insert": {
        const { error } = await supabase.from(op.table).insert(op.payload);
        return { error };
      }
      case "update": {
        const { id, ...rest } = op.payload;
        const { error } = await supabase
          .from(op.table)
          .update(rest)
          .eq("id", id as string);
        return { error };
      }
      case "delete": {
        const { error } = await supabase
          .from(op.table)
          .delete()
          .eq("id", op.payload.id as string);
        return { error };
      }
    }
  }

  // ─── Flush ────────────────────────────────────────────────────────────────

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;

    const queue = readQueue();
    if (queue.length === 0) return;

    // Não tenta flush se offline
    if (!navigator.onLine) return;

    // Não tenta flush se o token está expirado (evita o refresh automático offline)
    const sessionOk = await hasValidSession();
    if (!sessionOk) {
      console.warn("[OfflineQueue] Sessão inválida ou expirada, flush adiado");
      return;
    }

    flushingRef.current = true;
    setIsSyncing(true);

    let remaining = [...queue];

    for (const op of queue) {
      try {
        const { error } = await executeOp(op);
        // Remove da fila independente de erro (evita loop infinito em erro de RLS)
        remaining = remaining.filter((o) => o.id !== op.id);
        writeQueue(remaining);
        setPendingCount(remaining.length);

        if (error) {
          console.warn("[OfflineQueue] Erro ao executar op (descartada):", op.table, op.type, error);
        }
      } catch (err) {
        // Erro de rede no meio do flush: para e tenta novamente no próximo "online"
        console.warn("[OfflineQueue] Rede caiu durante flush, parando:", err);
        break;
      }
    }

    setIsSyncing(false);
    flushingRef.current = false;

    navigator.serviceWorker?.controller?.postMessage({ type: "FLUSH_DONE" });
  }, []);

  // ─── Enqueue ──────────────────────────────────────────────────────────────

  const enqueue = useCallback(
    (op: Omit<QueuedOperation, "timestamp">) => {
      const queue = readQueue();

      if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn("[OfflineQueue] Fila cheia, operação descartada.");
        return;
      }

      // Se já existe um insert do mesmo id, mescla com o update
      if (op.type === "update") {
        const existingIdx = queue.findIndex(
          (o) => o.id === op.id && o.type === "insert" && o.table === op.table
        );
        if (existingIdx !== -1) {
          queue[existingIdx].payload = { ...queue[existingIdx].payload, ...op.payload };
          writeQueue(queue);
          setPendingCount(queue.length);
          return;
        }
      }

      // Se veio delete de algo que ainda não foi ao servidor, cancela ambos
      if (op.type === "delete") {
        const withoutPrior = queue.filter(
          (o) => !(o.id === op.id && o.table === op.table)
        );
        if (withoutPrior.length < queue.length) {
          writeQueue(withoutPrior);
          setPendingCount(withoutPrior.length);
          return;
        }
      }

      const newOp: QueuedOperation = { ...op, timestamp: Date.now() };
      const next = [...queue, newOp];
      writeQueue(next);
      setPendingCount(next.length);

      // Flush imediato se online e sessão válida
      if (navigator.onLine) {
        void flushQueue();
      }
    },
    [flushQueue]
  );

  return { enqueue, pendingCount, isSyncing, isOnline, flush: flushQueue };
}