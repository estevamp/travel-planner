import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { getErrorMessage } from "../utils";
import type { Trip } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface DeleteItemParams {
  itemId: string;
  table: string;
  tripId: string;
  title?: string;
  isDark?: boolean;
}

interface UseDeleteItemReturn {
  delete: (
    params: DeleteItemParams,
    onConfirm: (callback: () => void) => Promise<void>
  ) => Promise<void>;
  isSubmitting: boolean;
}

interface UseDeleteItemDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
}

export function useDeleteItem(deps: UseDeleteItemDeps): UseDeleteItemReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { enqueue, isOnline } = deps;

  const deleteItem = async (
    { itemId, table, tripId, title, isDark }: DeleteItemParams,
    onConfirm: (callback: () => void) => Promise<void>
  ): Promise<void> => {
    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({ id: itemId, tripId, type: "delete", table: table as any, payload: { id: itemId } });
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from(table).delete().eq("id", itemId);

      if (error) {
        toast(getErrorMessage(error), "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { delete: deleteItem, isSubmitting };
}
