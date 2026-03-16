import { useEffect, useRef } from "react";
import { supabase } from "../supabase";

interface RealtimeTripCallbacks {
  onItineraryChange: () => void;
  onExpensesChange: () => void;
  onDocumentsChange: () => void;
  onIdeasChange: () => void;
  onMembersChange: () => void;
  onBudgetChange: () => void;
  onGlobalCatalogChange: () => void;
}

export function useRealtimeTrip(
  tripId: string | undefined,
  callbacks: RealtimeTripCallbacks
): void {
  const callbacksRef = useRef(callbacks);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Estabilizar callbacks para evitar recriação do canal
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const debounced = (key: string, fn: () => void, delay = 300) => {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, delay);
  };

  useEffect(() => {
    if (!tripId) return;
    // Não cria canal WebSocket se offline — evita loop de reconexão
    if (!navigator.onLine) return;

    const channel = supabase
      .channel(`trip-realtime-${tripId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("itinerary", () => callbacksRef.current.onItineraryChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("expenses", () => callbacksRef.current.onExpensesChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("expenses", () => callbacksRef.current.onExpensesChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("documents", () => callbacksRef.current.onDocumentsChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("ideas", () => callbacksRef.current.onIdeasChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("members", () => callbacksRef.current.onMembersChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("members", () => callbacksRef.current.onMembersChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_budgets", filter: `trip_id=eq.${tripId}` }, () =>
        debounced("budget", () => callbacksRef.current.onBudgetChange())
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    };
  }, [tripId]);
}