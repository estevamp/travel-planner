import { useEffect, useRef } from "react";
import { supabase } from "../supabase";

interface RealtimeTripCallbacks {
  onTripDataChange: () => void;       // itinerary, expenses, documents, members, invites, ideas
  onBudgetChange: () => void;         // trip_budgets
  onBalanceChange: () => void;        // expense_splits, settlements (usado pelo PeopleTab)
  onGlobalCatalogChange: () => void;  // expense_categories, itinerary_types (tabelas globais)
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
    if (timers.current[key]) {
      clearTimeout(timers.current[key]);
    }
    timers.current[key] = setTimeout(fn, delay);
  };

  useEffect(() => {
    if (!tripId) return;

    const channel = supabase
      .channel(`trip-realtime-${tripId}`)
      // onTripDataChange
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `trip_id=eq.${tripId}` }, () => {
        debounced("tripData", () => callbacksRef.current.onTripDataChange());
        debounced("balance", () => callbacksRef.current.onBalanceChange());
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_members", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_invites", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_links" }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "idea_assets" }, () => 
        debounced("tripData", () => callbacksRef.current.onTripDataChange())
      )
      // onBudgetChange
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_budgets", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("budget", () => callbacksRef.current.onBudgetChange())
      )
      // onBalanceChange
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, () => 
        debounced("balance", () => callbacksRef.current.onBalanceChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter: `trip_id=eq.${tripId}` }, () => 
        debounced("balance", () => callbacksRef.current.onBalanceChange())
      )
      // onGlobalCatalogChange
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => 
        debounced("global", () => callbacksRef.current.onGlobalCatalogChange())
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "itinerary_types" }, () => 
        debounced("global", () => callbacksRef.current.onGlobalCatalogChange())
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      // Limpar timers pendentes
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    };
  }, [tripId]);
}
