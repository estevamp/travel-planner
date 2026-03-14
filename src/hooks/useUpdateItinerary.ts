import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type { QueuedOperation } from "./useOfflineQueue";

interface UpdateItineraryParams {
  itemId: string;
  type_id: string | null;
  title: string;
  description: string;
  location: string;
  visibility: "public" | "private";
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
  tripId: string;
}

interface UseUpdateItineraryReturn {
  update: (params: UpdateItineraryParams) => Promise<boolean>;
  isSubmitting: boolean;
}

interface UseUpdateItineraryDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useUpdateItinerary(deps: UseUpdateItineraryDeps): UseUpdateItineraryReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { enqueue, isOnline, onSuccess } = deps;

  const update = async (params: UpdateItineraryParams): Promise<boolean> => {
    const {
      itemId,
      type_id,
      title,
      description,
      location,
      visibility,
      start_time,
      end_time,
      is_all_day,
      tripId,
    } = params;

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: itemId,
          tripId,
          type: "update",
          table: "itinerary",
          payload: {
            id: itemId,
            type_id,
            title,
            description,
            location,
            visibility,
            start_time,
            end_time,
            is_all_day,
          },
        });
        return true;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("itinerary").update({
        type_id,
        title,
        description,
        location,
        visibility,
        start_time,
        end_time,
        is_all_day,
      }).eq("id", itemId);

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
