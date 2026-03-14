import { useState } from "react";
import { supabase } from "../supabase";
import { useToast } from "./useToast";
import { useConfirm } from "./useConfirm";
import { getErrorMessage } from "../utils";
import type { QueuedOperation } from "./useOfflineQueue";

interface DeleteExpenseParams {
  expenseId: string;
  description: string;
  tripId: string;
  isDark?: boolean;
}

interface UseDeleteExpenseReturn {
  delete: (params: DeleteExpenseParams) => Promise<void>;
  isSubmitting: boolean;
}

interface UseDeleteExpenseDeps {
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
  isOnline: boolean;
  onSuccess?: () => Promise<void>;
}

export function useDeleteExpense(deps: UseDeleteExpenseDeps): UseDeleteExpenseReturn {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { enqueue, isOnline, onSuccess } = deps;

  const deleteExpense = async (params: DeleteExpenseParams): Promise<void> => {
    const { expenseId,  description, tripId, isDark } = params;

    const confirmed = await confirm({
      title: "Remover despesa?",
      message: `Remover a despesa "${description}"? Esta ação não pode ser desfeita.`,
      variant: "danger",
      isDark: isDark || false,
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      // ── OFFLINE GUARD ──
      if (!isOnline) {
        enqueue({
          id: expenseId,
          tripId,
          type: "delete",
          table: "expenses",
          payload: { id: expenseId },
        });
        return;
      }
      // ── FIM OFFLINE GUARD ──

      const { error } = await supabase.from("expenses").delete().eq("id", expenseId);

      if (error) {
        toast(getErrorMessage(error), "error");
        return;
      }

      // Callback de sucesso
      if (onSuccess) {
        await onSuccess();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return { delete: deleteExpense, isSubmitting };
}
