import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useTripContext } from "../context/TripContext";
import { getErrorMessage } from "../utils";
import type { Expense, CreateExpenseSplitInput, SplitType } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface UpdateExpenseParams {
  expenseId: string;
  description: string;
  amount: number;
  currency: string;
  visibility: "public" | "private";
  is_confirmed: boolean;
  category_id: string | null;
  payerId?: string;
  splitType?: SplitType;
  splits?: CreateExpenseSplitInput[];
  tripId: string;
}

interface UseUpdateExpenseReturn {
  update: (params: UpdateExpenseParams) => Promise<boolean>;
  isSubmitting: boolean;
}

interface UseUpdateExpenseDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useUpdateExpense(deps: UseUpdateExpenseDeps): UseUpdateExpenseReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { tripId: contextTripId } = useTripContext();
  const { enqueue, isOnline, onSuccess } = deps;

  const update = async (params: UpdateExpenseParams): Promise<boolean> => {
    const {
      expenseId,
      description,
      amount,
      currency,
      visibility,
      is_confirmed,
      category_id,
      payerId,
      splitType = "equal",
      splits = [],
      tripId,
    } = params;

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: expenseId,
          tripId,
          type: "update",
          table: "expenses",
          payload: {
            id: expenseId,
            description,
            amount,
            currency,
            visibility,
            is_confirmed,
            category_id,
            paid_by_member_id: payerId,
            split_type: splitType,
          },
        });
        return true;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("expenses").update({
        description,
        amount,
        currency,
        visibility,
        is_confirmed,
        category_id,
        paid_by_member_id: payerId,
        split_type: splitType,
      }).eq("id", expenseId);

      if (error) {
        toast(getErrorMessage(error), "error");
        return false;
      }

      // Atualizar splits se fornecido
      if (splits.length > 0 || visibility === "public") {
        await supabase.from("expense_splits").delete().eq("expense_id", expenseId);

        if (splits.length > 0 && visibility === "public") {
          const { error: splitsError } = await supabase.from("expense_splits").insert(
            splits.map(split => ({
              expense_id: expenseId,
              member_id: split.member_id,
              amount: split.amount || 0,
              percentage: split.percentage,
            }))
          );

          if (splitsError) {
            console.error("Erro ao salvar splits:", splitsError);
            toast("Despesa atualizada, mas houve erro ao salvar o rateio: " + getErrorMessage(splitsError), "error");
          }
        }
      }

      // Callback de sucesso (ex: fetchBalanceData)
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
