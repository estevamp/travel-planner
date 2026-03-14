import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type { Trip } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface UpdateItemParams {
  itemId: string;
  table: string;
  payload: Record<string, unknown>;
  tripId: string;
}

interface UseUpdateItemReturn {
  update: (params: UpdateItemParams, onTripUpdate: (updater: (prev: Trip) => Trip) => void) => Promise<boolean>;
  isSubmitting: boolean;
}

interface UseUpdateItemDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
}

export function useUpdateItem(deps: UseUpdateItemDeps): UseUpdateItemReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { enqueue, isOnline } = deps;

  const update = async (
    { itemId, table, payload, tripId }: UpdateItemParams,
    onTripUpdate: (updater: (prev: Trip) => Trip) => void
  ): Promise<boolean> => {
    setIsSubmitting(true);
    try {
      // Optimistic update (caller decides how to update state)
      // onTripUpdate is called by the caller with specific logic

      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: itemId,
          tripId,
          type: "update",
          table: table as any,
          payload: { id: itemId, ...payload },
        });
        return true;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from(table).update(payload).eq("id", itemId);

      if (error) {
        toast(getErrorMessage(error), "error");
        return false;
      }

      return true;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { update, isSubmitting };
}
