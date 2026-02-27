import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { getErrorMessage } from "../utils";
import type { TripBudget } from "../types";

export function useTripBudget(tripId: string | undefined, userId: string) {
  const [tripBudget, setTripBudget] = useState<TripBudget | null>(null);
  const [budgetOwnerUserId, setBudgetOwnerUserId] = useState<string>("");
  const [budgetCurrency, setBudgetCurrency] = useState<string>("BRL");
  const budgetAutosaveReadyRef = useRef(false);
  const { toast } = useToast();

  const loadTripBudget = async (id: string) => {
    const ownerRes = await supabase.rpc("budget_owner_user_id", { p_trip_id: id, p_user_id: userId });
    const owner = (ownerRes.data as string | null) || userId;
    if (ownerRes.error) {
      console.error('[useTripBudget] Falha ao buscar owner do budget:', ownerRes.error);
      // Não toastear — é um fetch de inicialização, falha silenciosa é aceitável
      setBudgetOwnerUserId(userId);
      setTripBudget(null);
      return;
    }
    setBudgetOwnerUserId(owner);

    const { data, error } = await supabase
      .from("trip_budgets")
      .select("id,trip_id,owner_user_id,budget_limit,currency")
      .eq("trip_id", id)
      .eq("owner_user_id", owner)
      .maybeSingle();

    if (error) {
      console.error('[useTripBudget] Falha ao buscar budget:', error);
      // Não-crítico: budget é opcional, app funciona sem ele
      setTripBudget(null);
      return;
    }

    if (!data) {
      setTripBudget(null);
      return;
    }

    const budget = data as TripBudget;
    setTripBudget({ ...budget, budget_limit: Number(budget.budget_limit) || 0 });
    setBudgetCurrency(budget.currency || "BRL");
  };

  const saveTripBudget = async () => {
    if (!tripId) return;
    const safeBudget = Math.max(0, Number((tripBudget?.budget_limit ?? 0)) || 0);
    const { data, error } = await supabase.rpc("upsert_trip_budget", {
      p_trip_id: tripId,
      p_budget_limit: safeBudget,
      p_currency: budgetCurrency,
    });

    if (error) {
      toast(getErrorMessage(error), 'error');
      return;
    }

    if (data) {
      const budget = data as TripBudget;
      setTripBudget({ ...budget, budget_limit: Number(budget.budget_limit) || 0 });
      setBudgetOwnerUserId(budget.owner_user_id);
    }
  };

  useEffect(() => {
    if (!tripId) return;
    void loadTripBudget(tripId);
  }, [tripId, userId]);

  useEffect(() => {
    if (!tripId || !tripBudget) return;
    if (!budgetAutosaveReadyRef.current) {
      budgetAutosaveReadyRef.current = true;
      return;
    }

    const timeout = setTimeout(async () => {
      await saveTripBudget();
    }, 500);

    return () => clearTimeout(timeout);
  }, [tripBudget?.budget_limit, tripId]);

  return {
    tripBudget,
    setTripBudget,
    budgetOwnerUserId,
    budgetCurrency,
    setBudgetCurrency,
    reloadBudget: tripId ? () => loadTripBudget(tripId) : () => {},
  };
}
