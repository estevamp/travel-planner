import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { getErrorMessage } from "../utils";
import type { QueuedOperation } from "./useOfflineQueue";

interface DeleteItineraryParams {
  itemId: string;
  title: string;
  tripId: string;
  isDark?: boolean;
}

interface UseDeleteItineraryReturn {
  delete: (params: DeleteItineraryParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseDeleteItineraryDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useDeleteItinerary(deps: UseDeleteItineraryDeps): UseDeleteItineraryReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { enqueue, isOnline, onSuccess } = deps;

  const deleteItem = async (params: DeleteItineraryParams): Promise<void> => {
    const { itemId, title, tripId, isDark } = params;

    const confirmed = await confirm({
      title: "Remover atividade?",
      message: `Remover a atividade "${title}"? Esta ação não pode ser desfeita.`,
      variant: "danger",
      isDark: isDark || false,
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: itemId,
          tripId,
          type: "delete",
          table: "itinerary",
          payload: { id: itemId },
        });
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("itinerary").delete().eq("id", itemId);

      if (error) {
        toast(getErrorMessage(error), "error");
        return;
      }

      // Callback de sucesso
      if (onSuccess) {
        await onSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { delete: deleteItem, isSubmitting };
}
