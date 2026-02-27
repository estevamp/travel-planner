import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type { TripSummary } from "../types";

export function useTripList() {
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
  const [creatingTripFromSidebar, setCreatingTripFromSidebar] = useState(false);
  const { toast } = useToast();

  const loadTripOptions = async () => {
    const { data, error } = await supabase
      .from("trips")
      .select("id,name,destination,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('[useTripList] Falha ao carregar viagens:', error);
      toast('Não foi possível carregar sua lista de viagens.', 'error');
      setTripOptions([]);
      return;
    }
    setTripOptions((data || []) as TripSummary[]);
  };

  const createTripFromSidebar = async (name: string, destination: string) => {
    if (creatingTripFromSidebar) return null;

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
      throw error || new Error("Falha ao criar viagem");
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
