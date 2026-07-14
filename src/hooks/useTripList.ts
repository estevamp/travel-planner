import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import type { TripSummary } from "../types";

export function useTripList() {
  const [tripOptions, setTripOptions] = useState<TripSummary[]>([]);
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

  useEffect(() => {
    void loadTripOptions();
  }, []);

  return {
    tripOptions,
    reloadTripOptions: loadTripOptions,
  };
}
