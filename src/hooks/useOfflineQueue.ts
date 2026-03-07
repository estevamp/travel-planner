/**
 * useOfflineQueue
 * ---------------
 * Fila persistida no localStorage para operações feitas offline.
 * Quando a conexão volta (evento "online" ou Background Sync via SW),
 * executa todas as operações pendentes contra o Supabase na ordem certa.
 *
 * Tabelas suportadas: expenses, itinerary, ideas, documents
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OfflineTable = "expenses" | "itinerary" | "ideas" | "documents";
export type OfflineOpType = "insert" | "update" | "delete";

export interface QueuedOperation {
  id: string;               // uuid gerado no cliente (também é o id do registro)
  timestamp: number;
  tripId: string;
  type: OfflineOpType;
  table: OfflineTable;
  payload: Record<string, unknown>;
  optimisticId?: string;    // id temporário usado na UI para delete/update
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

// ─── Helpers de storage ───────────────────────────────────────────────────────

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
    console.warn("[OfflineQueue] Falha ao persistir fila no localStorage");
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [pendingCount, setPendingCount] = useState<number>(() => readQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const flushingRef = useRef(false);

  // Sincroniza estado de online/offline
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flushQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Ouve mensagem do Service Worker (Background Sync)
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

  // ─── Executa uma operação contra o Supabase ────────────────────────────────

  async function executeOp(op: QueuedOperation): Promise<{ error: unknown }> {
    switch (op.type) {
      case "insert": {
        const { error } = await supabase.from(op.table).insert(op.payload);
        return { error };
      }
      case "update": {
        const { id, ...rest } = op.payload;
        const { error } = await supabase.from(op.table).update(rest).eq("id", id as string);
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

  // ─── Flush ─────────────────────────────────────────────────────────────────

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    const queue = readQueue();
    if (queue.length === 0) return;

    flushingRef.current = true;
    setIsSyncing(true);

    let remaining = [...queue];

    for (const op of queue) {
      try {
        const { error } = await executeOp(op);
        if (!error) {
          // Remove somente a operação que terminou com sucesso
          remaining = remaining.filter((o) => o.id !== op.id);
          writeQueue(remaining);
          setPendingCount(remaining.length);
        } else {
          // Se falhou (ex: conflito RLS), descarta mesmo assim para não bloquear
          console.warn("[OfflineQueue] Erro ao executar op, descartando:", op, error);
          remaining = remaining.filter((o) => o.id !== op.id);
          writeQueue(remaining);
          setPendingCount(remaining.length);
        }
      } catch (err) {
        // Erro de rede: para o flush, tenta novamente no próximo "online"
        console.warn("[OfflineQueue] Falha de rede ao executar op, abortando flush:", err);
        break;
      }
    }

    setIsSyncing(false);
    flushingRef.current = false;

    // Notifica o SW que o flush terminou (para Background Sync)
    navigator.serviceWorker?.controller?.postMessage({ type: "FLUSH_DONE" });
  }, []);

  // ─── Enqueue ────────────────────────────────────────────────────────────────

  const enqueue = useCallback(
    (op: Omit<QueuedOperation, "timestamp">) => {
      const queue = readQueue();

      if (queue.length >= MAX_QUEUE_SIZE) {
        console.warn("[OfflineQueue] Fila cheia (100 ops). Operação descartada.");
        return;
      }

      // Otimização: se já existe um insert com mesmo id e agora veio um update,
      // mescla o payload para não criar duplicata
      const existingInsertIdx = queue.findIndex(
        (o) => o.id === op.id && o.type === "insert" && o.table === op.table
      );
      if (op.type === "update" && existingInsertIdx !== -1) {
        queue[existingInsertIdx].payload = {
          ...queue[existingInsertIdx].payload,
          ...op.payload,
        };
        writeQueue(queue);
        setPendingCount(queue.length);
        return;
      }

      // Otimização: se existe insert/update do mesmo id e veio um delete, cancela ambos
      if (op.type === "delete") {
        const withoutPrior = queue.filter(
          (o) => !(o.id === op.id && o.table === op.table)
        );
        if (withoutPrior.length < queue.length) {
          // havia algo para esse id — só remove, sem enfileirar o delete
          writeQueue(withoutPrior);
          setPendingCount(withoutPrior.length);
          return;
        }
      }

      const newOp: QueuedOperation = { ...op, timestamp: Date.now() };
      const next = [...queue, newOp];
      writeQueue(next);
      setPendingCount(next.length);

      // Tenta flush imediato se online
      if (navigator.onLine) {
        void flushQueue();
      }
    },
    [flushQueue]
  );

  return { enqueue, pendingCount, isSyncing, isOnline, flush: flushQueue };
}