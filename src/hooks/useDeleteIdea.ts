import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { getErrorMessage } from "../utils";
import type { QueuedOperation } from "./useOfflineQueue";

interface DeleteIdeaParams {
  ideaId: string;
  title: string;
  tripId: string;
  isDark?: boolean;
  skipConfirm?: boolean;
}

interface UseDeleteIdeaReturn {
  deleteItem: (params: DeleteIdeaParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseDeleteIdeaDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useDeleteIdea(deps: UseDeleteIdeaDeps): UseDeleteIdeaReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { enqueue, isOnline, onSuccess } = deps;

  const deleteIdea = async (params: DeleteIdeaParams): Promise<void> => {
    const { ideaId, title, tripId, isDark, skipConfirm } = params;

    if (!skipConfirm) {
      const confirmed = await confirm({
        title: "Remover ideia?",
        message: `Remover a ideia "${title}"? Esta ação não pode ser desfeita.`,
        variant: "danger",
        isDark: isDark || false,
      });

      if (!confirmed) return;
    }

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: ideaId,
          tripId,
          type: "delete",
          table: "ideas",
          payload: { id: ideaId },
        });
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("ideas").delete().eq("id", ideaId);

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

  return { deleteItem: deleteIdea, isSubmitting };
}