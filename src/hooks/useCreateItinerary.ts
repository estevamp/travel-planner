import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useTripContext } from "../context/TripContext";
import { resizeImage, getErrorMessage } from "../utils";
import type { ItineraryItem } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface CreateItineraryParams {
  form: FormData;
  allDay: boolean;
  onClose: () => void;
}

interface UseCreateItineraryReturn {
  create: (params: CreateItineraryParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseCreateItineraryDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
}

export function useCreateItinerary(deps: UseCreateItineraryDeps): UseCreateItineraryReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { trip, setTrip, tripId, currentMember, itineraryTypes, settings } = useTripContext();
  const { enqueue, isOnline } = deps;

  const create = async ({ form, allDay, onClose }: CreateItineraryParams) => {
    if (!tripId || !currentMember) return;

    setIsSubmitting(true);
    try {
      const itineraryId = crypto.randomUUID();
      const title = ((form.get("title") as string) || "").trim() || "Item do itinerário";
      const visibility = (form.get("visibility") as string) === "private" ? "private" : "public";
      const type_id = (form.get("type_id") as string) || null;
      const description = (form.get("description") as string) || "";
      const location = (form.get("location") as string) || "";

      // Handle all-day events
      let start_time: string | null = null;
      let end_time: string | null = null;

      if (allDay) {
        const start_date = (form.get("start_date") as string) || null;
        const end_date = (form.get("end_date") as string) || null;
        start_time = start_date ? `${start_date}T00:00:00` : null;
        end_time = end_date ? `${end_date}T00:00:00` : null;
      } else {
        start_time = (form.get("start_time") as string) || null;
        end_time = (form.get("end_time") as string) || null;
      }

      const photoFile = form.get("photo") as File;
      let photo_url = null;

      if (photoFile && photoFile.size > 0) {
        try {
          photo_url = await resizeImage(photoFile);
        } catch (err) {
          console.error("Error resizing photo:", err);
        }
      }

      // Optimistic update
      const newItem: ItineraryItem = {
        id: itineraryId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        type_id,
        type: type_id ? (itineraryTypes.find(t => t.id === type_id) ?? null) : null,
        title,
        description,
        location,
        start_time,
        end_time,
        is_all_day: allDay,
        amount: 0,
        currency: settings.default_currency,
        visibility,
        photo_url,
      };

      setTrip(prev =>
        prev
          ? {
              ...prev,
              itinerary: [...prev.itinerary, newItem].sort((a, b) =>
                (a.start_time || "").localeCompare(b.start_time || "")
              ),
            }
          : null
      );

      // ── OFFLINE GUARD ──
      const itineraryPayload = {
        id: itineraryId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        type_id,
        title,
        description,
        location,
        start_time,
        end_time,
        is_all_day: allDay,
        amount: 0,
        currency: settings.default_currency,
        visibility,
        photo_url,
      };

      if (!isOnline) {
        enqueue({ id: itineraryId, tripId, type: "insert", table: "itinerary", payload: itineraryPayload });
        toast("Atividade salva offline — será sincronizada ao reconectar.", "info");
        onClose();
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("itinerary").insert({
        id: itineraryId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        type_id,
        title,
        description,
        location,
        start_time,
        end_time,
        is_all_day: allDay,
        amount: 0,
        currency: settings.default_currency,
        visibility,
        photo_url,
      });

      if (error) {
        toast(getErrorMessage(error), "error");
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { create, isSubmitting };
}
