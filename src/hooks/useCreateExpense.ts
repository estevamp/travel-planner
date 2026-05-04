import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useTripContext } from "../context/TripContext";
import { getErrorMessage, parseCurrencyToNumber } from "../utils";
import type { Expense, CreateExpenseSplitInput, SplitType } from "../types";
import type { QueuedOperation } from "./useOfflineQueue";

interface CreateExpenseParams {
  form: FormData;
  payerId: string;
  splits: CreateExpenseSplitInput[];
  splitType: SplitType;
  currency: string;
  onClose: () => void;
  onResetCurrency?: () => void;
  paymentDate?: string | null;
}

interface UseCreateExpenseReturn {
  create: (params: CreateExpenseParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseCreateExpenseDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
}

export function useCreateExpense(deps: UseCreateExpenseDeps): UseCreateExpenseReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { trip, setTrip, tripId, currentMember, categories, settings } = useTripContext();
  const { enqueue, isOnline } = deps;

  const create = async ({
    form,
    payerId,
    splits,
    splitType,
    currency,
    onClose,
    onResetCurrency,
    paymentDate,
  }: CreateExpenseParams) => {
    if (!tripId || !currentMember) return;

    setIsSubmitting(true);
    try {
      const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
      const visibility = splits.length > 0 ? "public" : ((form.get("visibility") as string) === "private" ? "private" : "public");
      const description = (form.get("description") as string) || "Despesa";
      const category_id = (form.get("category_id") as string) || null;
      const is_confirmed = form.get("is_confirmed") === "on";
      const expenseId = crypto.randomUUID();

      // Optimistic update
      const newExpense: Expense = {
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        payment_date: paymentDate || null,
        paid_by_member_id: payerId || currentMember.id,
        split_type: splitType,
        category: category_id ? categories.find(c => c.id === category_id) || null : null,
        is_confirmed,
      };

      setTrip(prev =>
        prev ? { ...prev, expenses: [...prev.expenses, newExpense].sort((a, b) => a.date.localeCompare(b.date)) } : null
      );

      // ── OFFLINE GUARD ──
      const expensePayload = {
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        payment_date: paymentDate || null,
        is_confirmed,
        paid_by_member_id: payerId || currentMember.id,
        split_type: splitType,
      };

      if (!isOnline) {
        enqueue({ id: expenseId, tripId, type: "insert", table: "expenses", payload: expensePayload });
        toast("Despesa salva offline — será sincronizada ao reconectar.", "info");
        onClose();
        onResetCurrency?.();
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("expenses").insert({
        id: expenseId,
        trip_id: tripId,
        created_by_member_id: currentMember.id,
        description,
        amount,
        currency,
        category_id,
        visibility,
        date: new Date().toISOString().split("T")[0],
        payment_date: paymentDate || null,
        is_confirmed,
        paid_by_member_id: payerId || currentMember.id,
        split_type: splitType,
      });

      if (error) {
        toast(getErrorMessage(error), "error");
      } else {
        // Salvar splits se houver
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
            toast("Despesa criada, mas houve erro ao salvar o rateio: " + getErrorMessage(splitsError), "error");
          }
        }

        onClose();
        onResetCurrency?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { create, isSubmitting };
}
