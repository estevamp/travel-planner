import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { getErrorMessage } from "../utils";
import type { TripSummary } from "../types";

export function useTripList() {
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
  const [creatingTripFromSidebar, setCreatingTripFromSidebar] = useState(false);

  const loadTripOptions = async () => {
    const { data, error } = await supabase.from("trips").select("id,name,destination,created_at").order("created_at", { ascending: false });
    if (error) {
      setTripOptions([]);
      return;
    }
    setTripOptions((data || []) as TripSummary[]);
  };

  const createTripFromSidebar = async () => {
    if (creatingTripFromSidebar) return null;
    const name = window.prompt("Nome da viagem:");
    if (!name?.trim()) return null;
    const destination = window.prompt("Destino da viagem:");
    if (!destination?.trim()) return null;

    setCreatingTripFromSidebar(true);
    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc("create_trip_with_admin", {
      p_name: name.trim(),
      p_destination: destination.trim(),
      p_start: now,
      p_end: now,
    });
    setCreatingTripFromSidebar(false);

    if (error || !data) {
      alert(getErrorMessage(error));
      return null;
    }

    await loadTripOptions();
    return data as string;
  };

  useEffect(() => {
    void loadTripOptions();
  }, []);

  return {
    tripOptions,
    creatingTripFromSidebar,
    createTripFromSidebar,
    reloadTripOptions: loadTripOptions,
  };
}
