import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useTripContext } from "../context/TripContext";
import { getErrorMessage } from "../utils";
import type { Idea } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface CreateIdeaParams {
  form: FormData;
  currency: string;
  onClose: () => void;
  onResetCurrency?: () => void;
}

interface UseCreateIdeaReturn {
  create: (params: CreateIdeaParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseCreateIdeaDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
}

export function useCreateIdea(deps: UseCreateIdeaDeps): UseCreateIdeaReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { trip, setTrip, tripId, currentMember, settings } = useTripContext();
  const { enqueue, isOnline } = deps;

  const create = async ({ form, currency, onClose, onResetCurrency }: CreateIdeaParams) => {
    if (!tripId || !currentMember) return;

    setIsSubmitting(true);
    try {
      const title = ((form.get("title") as string) || "").trim();
      if (!title) return;

      const visibility = (form.get("visibility") as string) === "private" ? "private" : "public";
      const notes = ((form.get("notes") as string) || "").trim() || null;
      const mapsUrl = ((form.get("maps_url") as string) || "").trim() || null;
      const ideaId = crypto.randomUUID();

      // Optimistic update
      const newIdea: Idea = {
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency,
        visibility,
        is_converted: false,
        created_at: new Date().toISOString(),
      };

      setTrip(prev => (prev ? { ...prev, ideas: [newIdea, ...(prev.ideas || [])] } : null));

      // ── OFFLINE GUARD ──
      const ideaPayload = {
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency,
        visibility,
        is_converted: false,
      };

      if (!isOnline) {
        enqueue({ id: ideaId, tripId, type: "insert", table: "ideas", payload: ideaPayload });
        toast("Ideia salva offline — será sincronizada ao reconectar.", "info");
        onClose();
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("ideas").insert({
        id: ideaId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        title,
        notes,
        maps_url: mapsUrl,
        estimated_amount: 0,
        currency,
        visibility,
        created_at: new Date().toISOString(),
      });

      if (error) {
        toast(getErrorMessage(error), "error");
      } else {
        onClose();
        onResetCurrency?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { create, isSubmitting };
}
