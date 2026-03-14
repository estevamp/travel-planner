import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type { QueuedOperation } from "./useOfflineQueue";

interface UpdateIdeaParams {
  ideaId: string;
  title: string;
  notes: string | null;
  maps_url: string | null;
  visibility: "public" | "private";
  tripId: string;
}

interface UseUpdateIdeaReturn {
  update: (params: UpdateIdeaParams) => Promise<boolean>;
  isSubmitting: boolean;
}

interface UseUpdateIdeaDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useUpdateIdea(deps: UseUpdateIdeaDeps): UseUpdateIdeaReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { enqueue, isOnline, onSuccess } = deps;

  const update = async (params: UpdateIdeaParams): Promise<boolean> => {
    const { ideaId, title, notes, maps_url, visibility, tripId } = params;

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: ideaId,
          tripId,
          type: "update",
          table: "ideas",
          payload: {
            id: ideaId,
            title,
            notes,
            maps_url,
            visibility,
          },
        });
        return true;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("ideas").update({
        title,
        notes,
        maps_url,
        visibility,
      }).eq("id", ideaId);

      if (error) {
        toast(getErrorMessage(error), "error");
        return false;
      }

      // Callback de sucesso
      if (onSuccess) {
        await onSuccess();
      }

      return true;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { update, isSubmitting };
}
