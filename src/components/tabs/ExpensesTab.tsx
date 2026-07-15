import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { Lock, Unlock, ChevronDown, ChevronUp, Download, FilePenLine, Trash2, Users } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber, exportExpensesToCsv, exportPaymentsToCsv } from "../../utils";
import type { Trip, Expense, Visibility, CreateExpenseSplitInput, SplitType, ExpenseWithSplits, Settlement, MemberBalance, SimplifiedTransfer } from "../../types";
import type { ExpenseSplit } from '../../types/splitting';
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { Modal } from "../Modal";
import { CurrencySelector } from "../CurrencySelector";
import { PayerSelector } from "../PayerSelector";
import { SplitSelector } from "../SplitSelector";
import { useCurrencyConversion } from "../../hooks/useCurrencyConversion";
import { VisibilityBottomSheet } from "../VisibilityBottomSheet";
import { BalancesSummary } from "../BalancesSummary";
import { TripSettlementModal } from "../TripSettlementModal";
import {
  calculateNetBalances,
  simplifyDebts,
  computeBilateralTransfers,
  mergeSpouseTransfers,
} from "../../utils/splitting";
import type { QueuedOperation } from "../../hooks/useOfflineQueue";
import { useOptimisticVisibility } from "../../hooks/useOptimisticVisibility";
import { useUpdateExpense } from "../../hooks/useUpdateExpense";
import { useDeleteExpense } from "../../hooks/useDeleteExpense";
import { ExpenseListItem } from "../ExpenseListItem";
import { useI18n } from "../../i18n/I18nProvider";

// Tipo da resposta bruta do Supabase para a query "*, expense_splits(*)"
type ExpenseRowFromSupabase = Omit<ExpenseWithSplits, 'splits'> & {
  expense_splits: ExpenseSplit[];
};

interface ExpensesTabProps {
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
  isOnline: boolean;
  enqueue: (op: Omit<QueuedOperation, "timestamp">) => void;
}

export function ExpensesTab({ onOpenModal, onSetActiveTab, onTripUpdate, isOnline, enqueue }: ExpensesTabProps) {
  const { trip, tripId, currentMember, members, categories, settings, tripBudget, reloadTrip } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { t } = useI18n();
  const { toggleVisibility: toggleExpenseVisibility } = useOptimisticVisibility<Expense>(
    "expenses",
    "expenses",
    onTripUpdate
  );
  const { convert, rates: exchangeRates, isLoading: isRatesLoading } = useCurrencyConversion(settings.default_currency);
  
  // Custom hooks para UPDATE e DELETE
  const { update: updateExpense, isSubmitting: isUpdatingExpense } = useUpdateExpense({
    enqueue,
    isOnline,
  });
  const { deleteItem: deleteExpenseItem, isSubmitting: isDeletingExpense } = useDeleteExpense({
    enqueue,
    isOnline,
  });
  
  const [isBudgetExpanded, setIsBudgetExpanded] = useState(false);

  // Sub-aba da tela de despesas
  const [expenseSubTab, setExpenseSubTab] = useState<"relatorio" | "pagamentos">("relatorio");
  const [expenseSort, setExpenseSort] = useState<"dateAsc" | "dateDesc" | "amountDesc" | "amountAsc" | "descriptionAsc" | "descriptionDesc">("dateAsc");

  // Estados para rateio e saldos
  const [expensesWithSplits, setExpensesWithSplits] = useState<ExpenseWithSplits[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [transfers, setTransfers] = useState<SimplifiedTransfer[]>([]);

  const isPartiallyPrivateExpense = useCallback((expense: ExpenseWithSplits) => {
    const participantIds = new Set(expense.splits?.map((split) => split.member_id) || []);
    return participantIds.size > 0 && participantIds.size < members.length;
  }, [members.length]);

  const canCurrentMemberViewExpenseAmount = useCallback((expense: ExpenseWithSplits) => {
    if (!isPartiallyPrivateExpense(expense)) return true;
    if (!currentMember) return false;

    return expense.created_by_member_id === currentMember.id
      || expense.paid_by_member_id === currentMember.id
      || expense.splits.some((split) => split.member_id === currentMember.id);
  }, [currentMember, isPartiallyPrivateExpense]);

  const visibleExpensesWithSplits = useMemo(
    () => expensesWithSplits.filter((expense) => canCurrentMemberViewExpenseAmount(expense)),
    [expensesWithSplits, canCurrentMemberViewExpenseAmount]
  );

  // Buscar despesas com splits e settlements
  const fetchBalanceData = useCallback(async () => {
    const { data: expensesData, error: expError } = await supabase
      .from("expenses")
      .select("*, expense_splits(*)")
      .eq("trip_id", tripId);

    const { data: settlementsData, error: settlementsError } = await supabase
      .from("settlements")
      .select("*")
      .eq("trip_id", tripId);

    if (!expError) {
      const expensesWithSplitsData: ExpenseWithSplits[] = (
        (expensesData as ExpenseRowFromSupabase[]) || []
      ).map((exp) => ({
        ...exp,
        splits: exp.expense_splits || [],
      }));
      setExpensesWithSplits(expensesWithSplitsData);
    }

    if (!settlementsError) {
      setSettlements(settlementsData || []);
    }
  }, [tripId]);

  useEffect(() => {
    fetchBalanceData();

    const expensesChannel = supabase
      .channel('expenses-balances-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `trip_id=eq.${tripId}` }, () => {
        fetchBalanceData();
      })
      .subscribe();

    const expenseSplitsChannel = supabase
      .channel('expense-splits-balances-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_splits' }, () => {
        fetchBalanceData();
      })
      .subscribe();

    const settlementsChannel = supabase
      .channel('settlements-balances-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `trip_id=eq.${tripId}` }, () => {
        fetchBalanceData();
      })
      .subscribe();

    return () => {
      if (expensesChannel) void supabase.removeChannel(expensesChannel);
      if (expenseSplitsChannel) void supabase.removeChannel(expenseSplitsChannel);
      if (settlementsChannel) void supabase.removeChannel(settlementsChannel);
    };
  }, [fetchBalanceData, tripId]);

  // Saldos BRUTOS (sem settlements) — usados para gerar a lista completa do modal
  const [rawBalances, setRawBalances] = useState<MemberBalance[]>([]);

  useEffect(() => {
    if (isRatesLoading) {
      setRawBalances([]);
      return;
    }

    const calculated = calculateNetBalances(
      visibleExpensesWithSplits,
      [],           // <── sem settlements
      members,
      settings.default_currency,
      exchangeRates
    );
    setRawBalances(calculated);
  }, [visibleExpensesWithSplits, members, settings.default_currency, exchangeRates, isRatesLoading]);

  // Transferências bilaterais par a par (sem otimização global)
  const bilateralTransfers = useMemo(
    () => {
      if (isRatesLoading) return [];
      return computeBilateralTransfers(
        visibleExpensesWithSplits,
        settlements,
        members,
        settings.default_currency,
        exchangeRates
      );
    },
    [visibleExpensesWithSplits, settlements, members, settings.default_currency, exchangeRates, isRatesLoading]
  );

  // Transferências com casais agrupados — exibidas na aba Pagamentos
  const mergedTransfers = useMemo(
    () => mergeSpouseTransfers(bilateralTransfers, members, settings.default_currency),
    [bilateralTransfers, members, settings.default_currency]
  );

  // Resumo a pagar / a receber por participante/casal na aba Pagamentos.
  const memberPaymentSummary = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; saldo: number }>();
    const visited = new Set<string>();

    for (const member of members) {
      if (visited.has(member.id)) continue;

      const spouse = member.spouse_member_id
        ? members.find((candidate) => candidate.id === member.spouse_member_id)
        : null;

      const groupMembers = spouse && !visited.has(spouse.id)
        ? [member, spouse]
        : [member];

      groupMembers.forEach((entry) => visited.add(entry.id));

      const saldo = Math.round(groupMembers.reduce((sum, entry) => {
        const memberBalance = balances.find((balance) => balance.member_id === entry.id);
        return sum + (memberBalance?.net_balance ?? 0);
      }, 0) * 100) / 100;

      grouped.set(member.id, {
        id: member.id,
        name: groupMembers.map((entry) => entry.display_name ?? t("expenses.memberFallback")).join("/"),
        saldo,
      });
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        aReceber: group.saldo > 0 ? group.saldo : 0,
        aPagar: group.saldo < 0 ? Math.abs(group.saldo) : 0,
      }));
  }, [balances, members]);

  // Calcular saldos com conversão de moedas
  useEffect(() => {
    if (isRatesLoading) {
      setBalances([]);
      return;
    }

    const calculatedBalances = calculateNetBalances(
      visibleExpensesWithSplits,
      settlements,
      members,
      settings.default_currency,
      exchangeRates
    );
    setBalances(calculatedBalances);
  }, [visibleExpensesWithSplits, settlements, members, settings.default_currency, exchangeRates, isRatesLoading]);

  const convertedExpenses = useMemo(() => {
    if (isRatesLoading) {
      return trip.expenses.map(exp => ({ ...exp, convertedAmount: 0, userAmount: 0 }));
    }
    return trip.expenses.map(exp => {
      const currency = exp.currency || settings.default_currency;
      const convertedAmount = convert(Number(exp.amount) || 0, currency);

      let userAmount = convertedAmount;
      const expenseWithSplits = expensesWithSplits.find(e => e.id === exp.id);

      if (expenseWithSplits && expenseWithSplits.splits && expenseWithSplits.splits.length > 0) {
        if (!canCurrentMemberViewExpenseAmount(expenseWithSplits)) {
          userAmount = 0;
          return { ...exp, convertedAmount, userAmount };
        }

        const relevantSplits = expenseWithSplits.splits.filter(split =>
          split.member_id === currentMember?.id ||
          (currentMember?.spouse_member_id && split.member_id === currentMember.spouse_member_id)
        );

        const totalSplitAmount = relevantSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
        const originalAmount = Number(exp.amount) || 0;

        if (originalAmount > 0) {
          userAmount = (totalSplitAmount / originalAmount) * convertedAmount;
        } else {
          userAmount = 0;
        }
      }

      return { ...exp, convertedAmount, userAmount };
    });
  }, [trip.expenses, settings.default_currency, convert, expensesWithSplits, currentMember, canCurrentMemberViewExpenseAmount, isRatesLoading]);

  const convertedAmountByExpenseId = useMemo(
    () => new Map(convertedExpenses.map((expense) => [expense.id, expense.convertedAmount])),
    [convertedExpenses]
  );

  const sortedExpenses = useMemo(() => {
    const toTime = (value: string) => {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });

    return [...trip.expenses].sort((a, b) => {
      const dateA = a.payment_date || a.date;
      const dateB = b.payment_date || b.date;

      switch (expenseSort) {
        case "dateDesc":
          return toTime(dateB) - toTime(dateA);
        case "amountDesc":
          return (convertedAmountByExpenseId.get(b.id) || 0) - (convertedAmountByExpenseId.get(a.id) || 0);
        case "amountAsc":
          return (convertedAmountByExpenseId.get(a.id) || 0) - (convertedAmountByExpenseId.get(b.id) || 0);
        case "descriptionAsc":
          return collator.compare(a.description || "", b.description || "");
        case "descriptionDesc":
          return collator.compare(b.description || "", a.description || "");
        case "dateAsc":
        default:
          return toTime(dateA) - toTime(dateB);
      }
    });
  }, [trip.expenses, expenseSort, convertedAmountByExpenseId]);

  const payerTotals = useMemo(() => {
    const splitExpenses = visibleExpensesWithSplits.filter(exp => exp.splits && exp.splits.length > 0);
    const totals: Record<string, number> = {};
    const confirmedTotals: Record<string, number> = {};
    splitExpenses.forEach(exp => {
      if (!exp.paid_by_member_id) return;
      const currency = exp.currency || settings.default_currency;
      const converted = convert(Number(exp.amount) || 0, currency);
      totals[exp.paid_by_member_id] = (totals[exp.paid_by_member_id] || 0) + converted;
      if (exp.is_confirmed) {
        confirmedTotals[exp.paid_by_member_id] = (confirmedTotals[exp.paid_by_member_id] || 0) + converted;
      }
    });
    return members
      .map(m => ({
        name: m.display_name || t("expenses.memberFallback"),
        amount: totals[m.id] || 0,
        confirmedAmount: confirmedTotals[m.id] || 0,
      }))
      .filter(m => m.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [visibleExpensesWithSplits, members, convert, settings.default_currency, t]);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  // Overflow menu (⋯) por card — mesmo padrão usado na aba Atividades
  const [itemMenu, setItemMenu] = useState<{ exp: Expense; top: number; right: number } | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<{
    description: string;
    category_id: string;
    amount: string;
    currency: string;
    visibility: Visibility;
    is_confirmed: boolean;
    payment_date: string | null;
  }>({
    description: "",
    category_id: "",
    amount: "0",
    currency: settings.default_currency,
    visibility: "public",
    is_confirmed: false,
    payment_date: null,
  });

  const registerPayment = async (fromMemberIds: string[], toMemberIds: string[], amount: number) => {
    const normalizedAmount = Math.round(amount * 100) / 100;
    if (normalizedAmount <= 0) return;

    const matchingTransfers = bilateralTransfers
      .filter(
        (transfer) =>
          fromMemberIds.includes(transfer.from_member_id) &&
          toMemberIds.includes(transfer.to_member_id) &&
          transfer.amount > 0.01
      )
      .sort((a, b) => b.amount - a.amount);

    let remaining = normalizedAmount;
    const nowIso = new Date().toISOString();
    const rows: Array<{
      trip_id: string;
      from_member_id: string;
      to_member_id: string;
      amount: number;
      currency: string;
      date: string;
      is_confirmed: boolean;
    }> = [];

    for (const transfer of matchingTransfers) {
      if (remaining <= 0.009) break;
      const chunk = Math.min(remaining, transfer.amount);
      const roundedChunk = Math.round(chunk * 100) / 100;
      if (roundedChunk <= 0) continue;

      rows.push({
        trip_id: tripId!,
        from_member_id: transfer.from_member_id,
        to_member_id: transfer.to_member_id,
        amount: roundedChunk,
        currency: settings.default_currency,
        date: nowIso,
        is_confirmed: true,
      });

      remaining = Math.round((remaining - roundedChunk) * 100) / 100;
    }

    if (remaining > 0.009 && fromMemberIds.length > 0 && toMemberIds.length > 0) {
      rows.push({
        trip_id: tripId!,
        from_member_id: fromMemberIds[0],
        to_member_id: toMemberIds[0],
        amount: remaining,
        currency: settings.default_currency,
        date: nowIso,
        is_confirmed: true,
      });
    }

    if (rows.length === 0) {
      toast(t("expenses.registerPaymentError"), "error");
      return;
    }

    const { error } = await supabase.from("settlements").insert(rows);
    if (error) { toast(getErrorMessage(error), "error"); return; }
    await fetchBalanceData();
    toast(t("expenses.paymentRegistered"), "success");
  };

  const undoPayment = async (settlementId: string) => {
    const { error } = await supabase
      .from("settlements")
      .delete()
      .eq("id", settlementId)
      .eq("trip_id", tripId);

    if (error) {
      toast(getErrorMessage(error), "error");
      return;
    }

    await fetchBalanceData();
    toast(t("expenses.paymentUndone"), "success");
  };

  const handleExportExpenses = () => {
    if (!trip || !members || !categories || !settings) {
      toast(t("expenses.exportError"), "error");
      return;
    }

    const csv = exportExpensesToCsv(
      expensesWithSplits,
      settlements,
      members,
      categories,
      settings.default_currency,
      settings.language_code,
      convert
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `despesas-${trip.name.replace(/\s/g, "_")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast(t("expenses.exportSuccess"), "success");
    } else {
      toast(t("expenses.exportNotSupported"), "error");
    }
  };

  const handleExportPayments = () => {
    if (!trip || !members || !settings) {
      toast(t("expenses.exportError"), "error");
      return;
    }

    const csv = exportPaymentsToCsv(
      settlements,
      members,
      settings.default_currency,
      convert
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `pagamentos-${trip.name.replace(/\s/g, "_")}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast(t("expenses.exportSuccess"), "success");
    } else {
      toast(t("expenses.exportNotSupported"), "error");
    }
  };

  // Estados para modal de edição completo (com splits)
  const [showEditExpenseModal, setShowEditExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editExpensePayerId, setEditExpensePayerId] = useState<string>("");
  const [editExpenseSplits, setEditExpenseSplits] = useState<CreateExpenseSplitInput[]>([]);
  const [editExpenseSplitType, setEditExpenseSplitType] = useState<SplitType>("equal");
  const [editExpenseAmount, setEditExpenseAmount] = useState<string>("0");
  const [editExpenseCurrency, setEditExpenseCurrency] = useState(settings.default_currency);
  const [isEditExpenseSplitValid, setIsEditExpenseSplitValid] = useState(true);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [visibilitySheet, setVisibilitySheet] = useState<{
    open: boolean;
    itemId: string | null;
    currentVisibility: Visibility;
    onConfirm: (() => void) | null;
  }>({ open: false, itemId: null, currentVisibility: 'public', onConfirm: null });

  const handleToggleExpenseVisibility = (exp: Expense) => {
    const expWithSplits = expensesWithSplits.find((entry) => entry.id === exp.id);
    const hasSplits = Boolean(expWithSplits && expWithSplits.splits && expWithSplits.splits.length > 0);
    if (hasSplits) {
      toast(t("expenses.splitMustBePublic"), "error");
      return;
    }
    setVisibilitySheet({
      open: true,
      itemId: exp.id,
      currentVisibility: exp.visibility,
      onConfirm: () => void toggleExpenseVisibility(exp),
    });
  };

  const saveExpenseEdit = async (expenseId: string) => {
    if (!editingExpenseId || editingExpenseId !== expenseId || isUpdatingExpense) return;
    const description = expenseDraft.description.trim();
    if (!description) return;
    const nextAmount = parseCurrencyToNumber(expenseDraft.amount) || 0;

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      expenses: prev.expenses.map((exp) =>
        exp.id === expenseId
          ? {
              ...exp,
              description,
              category_id: expenseDraft.category_id || null,
              amount: nextAmount,
              currency: expenseDraft.currency || settings.default_currency,
              visibility: expenseDraft.visibility,
              is_confirmed: expenseDraft.is_confirmed,
              payment_date: expenseDraft.payment_date,
              category: expenseDraft.category_id
                ? categories.find(c => c.id === expenseDraft.category_id) || null
                : null
            }
          : exp
      ),
    }));

    const success = await updateExpense({
      expenseId,
      description,
      amount: nextAmount,
      currency: expenseDraft.currency || settings.default_currency,
      visibility: expenseDraft.visibility,
      is_confirmed: expenseDraft.is_confirmed,
      category_id: expenseDraft.category_id || null,
      payment_date: expenseDraft.payment_date,
      tripId: tripId!,
    });

    if (success) {
      setEditingExpenseId(null);
      await fetchBalanceData();
    }
  };

  const openEditExpenseModal = async (expense: Expense) => {
    setEditingExpense(expense);
    setEditExpenseAmount(maskCurrency(String(Math.round((expense.amount || 0) * 100))));
    setEditExpenseCurrency(expense.currency || settings.default_currency);

    // Use expense data directly instead of making redundant query
    setEditExpensePayerId(expense.paid_by_member_id || currentMember?.id || "");
    setEditExpenseSplitType(expense.split_type || "equal");

    const { data: splitsData } = await supabase
      .from("expense_splits")
      .select("*")
      .eq("expense_id", expense.id);

    if (splitsData) {
      setEditExpenseSplits(splitsData.map(s => ({
        member_id: s.member_id,
        amount: s.amount,
        percentage: s.percentage,
      })));
    } else {
      setEditExpenseSplits([]);
    }

    setShowEditExpenseModal(true);
  };

  const closeEditExpenseModal = () => {
    setShowEditExpenseModal(false);
    setEditingExpense(null);
    setEditExpensePayerId("");
    setEditExpenseSplits([]);
    setEditExpenseSplitType("equal");
    setEditExpenseAmount("0");
  };

  const saveEditExpense = async (form: FormData) => {
    if (!editingExpense || !currentMember) return;

    const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
    const visibility = editExpenseSplits.length > 0
      ? "public"
      : ((form.get("visibility") as string) === "private" ? "private" : "public");
    const description = (form.get("description") as string) || t("expenses.defaultDescription");
    const category_id = (form.get("category_id") as string) || null;
    const is_confirmed = form.get("is_confirmed") === "on";

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      expenses: prev.expenses.map((exp) =>
        exp.id === editingExpense.id
          ? {
              ...exp,
              description,
              category_id,
              amount,
              currency: editExpenseCurrency,
              visibility,
              is_confirmed,
              payment_date: (form.get("payment_date") as string) || null,
              category: category_id ? categories.find(c => c.id === category_id) || null : null
            }
          : exp
      ),
    }));

    const success = await updateExpense({
      expenseId: editingExpense.id,
      description,
      amount,
      currency: editExpenseCurrency,
      visibility,
      is_confirmed,
      category_id,
      payment_date: (form.get("payment_date") as string) || null,
      payerId: editExpensePayerId,
      splitType: editExpenseSplitType,
      splits: editExpenseSplits,
      tripId: tripId!,
    });

    if (success) {
      closeEditExpenseModal();
      await fetchBalanceData();
    }
  };

  const deleteExpenseHandler = async (expense: Expense) => {
    const confirmed = await confirm({
      title: t("expenses.deleteTitle"),
      message: t("expenses.deleteMessage", { description: expense.description }),
      variant: "danger",
      isDark: settings.dark_mode,
    });
    if (!confirmed) return;
  
    // Optimistic update — só executa após confirmação do usuário
    onTripUpdate((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((exp) => exp.id !== expense.id),
    }));
  
    await deleteExpenseItem({
      expenseId: expense.id,
      description: expense.description,
      tripId: tripId!,
      isDark: settings.dark_mode,
      skipConfirm: true, // confirmação já foi feita acima
    });
  
    await fetchBalanceData();
  };

  const confirmedTotal = convertedExpenses
    .filter(expense => expense.is_confirmed)
    .reduce((total, expense) => total + expense.userAmount, 0);
  const predictedTotal = convertedExpenses.reduce((total, expense) => total + expense.userAmount, 0);

  const brlPerUsd = useMemo(() => {
    const brlRate = Number(exchangeRates.BRL);
    const usdRate = Number(exchangeRates.USD);
    if (brlRate > 0 && usdRate > 0) {
      const quote = brlRate / usdRate;
      return Number.isFinite(quote) ? quote : null;
    }
    return null;
  }, [exchangeRates]);

  const brlPerEur = useMemo(() => {
    const brlRate = Number(exchangeRates.BRL);
    const eurRate = Number(exchangeRates.EUR);
    if (brlRate > 0 && eurRate > 0) {
      const quote = brlRate / eurRate;
      return Number.isFinite(quote) ? quote : null;
    }
    return null;
  }, [exchangeRates]);

  const budgetLimit = Math.max(0, Number(tripBudget?.budget_limit) || 0);
  const confirmedProgress = budgetLimit > 0 ? Math.min((confirmedTotal / budgetLimit) * 100, 100) : 0;
  const predictedProgress = budgetLimit > 0 ? Math.min((predictedTotal / budgetLimit) * 100, 100) : 0;
  const budgetRemaining = budgetLimit - predictedTotal;
  const isOverBudget = budgetLimit > 0 && predictedTotal > budgetLimit;

  return (
    <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">

      {/* ── Sub-abas: Relatório | Pagamentos ── */}
      <div className={cn(
        "flex rounded-xl p-1 gap-1",
        settings.dark_mode ? "bg-zinc-800" : "bg-zinc-100"
      )}>
        {(["relatorio", "pagamentos"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setExpenseSubTab(tab)}
            className={cn(
              "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
              expenseSubTab === tab
                ? "text-white shadow-sm"
                : settings.dark_mode
                ? "text-zinc-400 hover:text-zinc-200"
                : "text-zinc-500 hover:text-zinc-700"
            )}
            style={expenseSubTab === tab ? { backgroundColor: "var(--accent-color)" } : undefined}
          >
            {tab === "relatorio" ? t("expenses.subtab.report") : t("expenses.subtab.payments")}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: RELATÓRIO                                 */}
      {/* ══════════════════════════════════════════════ */}
      {expenseSubTab === "relatorio" && (
        <>
          {!isRatesLoading && (
            <Card>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h3 className={cn("text-lg font-bold", settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
                      {t("expenses.budgetCardTitle")}
                    </h3>
                    <p className={cn("text-sm mt-1", settings.dark_mode ? "text-zinc-500" : "text-zinc-400")}>
                      {budgetLimit > 0
                        ? t("expenses.limitLabel", { amount: formatCurrency(budgetLimit, settings.default_currency) })
                        : t("expenses.noBudgetDefined")}
                    </p>
                  </div>
                  <div className="flex sm:flex-col gap-4 sm:gap-1 sm:text-right">
                    <div>
                      <p className={cn("text-xs", settings.dark_mode ? "text-zinc-500" : "text-zinc-500")}>{t("expenses.confirmed")}</p>
                      <p className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums">
                        {formatCurrency(confirmedTotal, settings.default_currency)}
                      </p>
                    </div>
                    <div>
                      <p className={cn("text-xs", settings.dark_mode ? "text-zinc-500" : "text-zinc-500")}>{t("expenses.totalPredicted")}</p>
                      <p className={cn("text-base sm:text-lg font-bold tabular-nums", settings.dark_mode ? "text-zinc-200" : "text-zinc-800")}>
                        {formatCurrency(predictedTotal, settings.default_currency)}
                      </p>
                    </div>
                  </div>
                </div>

                {budgetLimit > 0 && (
                  <button
                    onClick={() => setIsBudgetExpanded(!isBudgetExpanded)}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-1 transition-colors border-t mt-2",
                      settings.dark_mode
                        ? "text-zinc-500 hover:text-zinc-300 border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-600 border-zinc-100"
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {isBudgetExpanded ? t("expenses.collapseDetails") : t("expenses.viewBudgetDetails")}
                    </span>
                    {isBudgetExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}

                {budgetLimit > 0 && isBudgetExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4 pt-2"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className={settings.dark_mode ? "text-zinc-400" : "text-zinc-600"}>{t("expenses.progress")}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-600">{t("expenses.confirmed")}: {confirmedProgress.toFixed(1)}%</span>
                          <span className={cn("font-bold", isOverBudget ? "text-red-600" : (settings.dark_mode ? "text-blue-400" : "text-blue-600"))}>
                            {t("expenses.predicted")}: {predictedProgress.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="relative h-4 rounded-full overflow-hidden border-2 shadow-inner" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                        <div
                          className="absolute h-full transition-all duration-500 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                          style={{ width: `${Math.min(confirmedProgress, 100)}%` }}
                        />
                        <div
                          className={cn("absolute h-full transition-all duration-500 rounded-full opacity-40", isOverBudget ? "bg-gradient-to-r from-red-500 to-red-600" : "bg-gradient-to-r from-blue-500 to-blue-600")}
                          style={{ width: `${Math.min(predictedProgress, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className={cn(
                      "p-4 rounded-xl border-2",
                      isOverBudget
                        ? (settings.dark_mode ? "bg-red-950/30 border-red-900/50" : "bg-red-50 border-red-300")
                        : (settings.dark_mode ? "bg-emerald-950/30 border-emerald-900/50" : "bg-emerald-50 border-emerald-300")
                    )}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={cn("text-sm font-semibold", settings.dark_mode ? "text-zinc-300" : "text-zinc-700")}>
                          {isOverBudget ? t("expenses.overBudget") : t("expenses.remaining")}
                        </span>
                        <span className={cn("text-lg sm:text-xl font-bold tabular-nums", isOverBudget ? "text-red-600" : "text-emerald-600")}>
                          {isOverBudget ? "-" : ""}{formatCurrency(Math.abs(budgetRemaining), settings.default_currency)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {budgetLimit === 0 && (
                  <div className="p-4 rounded-xl border-2" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <p className={cn("text-sm text-center", settings.dark_mode ? "text-zinc-400" : "text-zinc-600")}>
                      💡 {t("expenses.configureBudgetPrefix")} <button
                        onClick={() => onSetActiveTab("settings")}
                        className={cn("font-semibold hover:underline", settings.dark_mode ? "text-blue-400" : "text-blue-600")}
                      >{t("expenses.configureBudgetLink")}</button> {t("expenses.configureBudgetSuffix")}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card className="w-full sm:w-72 space-y-1">
              <label className={cn("block text-xs font-semibold uppercase", settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>
                {t("expenses.sort.label")}
              </label>
              <select
                value={expenseSort}
                onChange={(event) => setExpenseSort(event.target.value as typeof expenseSort)}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-sm",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
              >
                <option value="dateAsc">{t("expenses.sort.dateAsc")}</option>
                <option value="dateDesc">{t("expenses.sort.dateDesc")}</option>
                <option value="amountDesc">{t("expenses.sort.amountDesc")}</option>
                <option value="amountAsc">{t("expenses.sort.amountAsc")}</option>
                <option value="descriptionAsc">{t("expenses.sort.descriptionAsc")}</option>
                <option value="descriptionDesc">{t("expenses.sort.descriptionDesc")}</option>
              </select>
            </Card>

          {/* Desktop table */}
          <Card className="p-0 overflow-hidden hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={settings.dark_mode ? "bg-zinc-800/50" : "bg-zinc-50"}>
                  <th className="px-4 py-3 text-xs uppercase">{t("expenses.table.description")}</th>
                  <th className="px-4 py-3 text-xs uppercase">{t("expenses.table.category")}</th>
                  <th className="px-4 py-3 text-xs uppercase">{t("expenses.table.amount")}</th>
                  <th className="px-4 py-3 text-xs uppercase text-right">{t("expenses.table.action")}</th>
                </tr>
              </thead>
              <tbody className={cn("divide-y", settings.dark_mode ? "divide-zinc-800" : "divide-zinc-100")}>
                {sortedExpenses.map((exp) => (
                  <ExpenseListItem
                    key={exp.id}
                    exp={exp}
                    layout="table"
                    editingExpenseId={editingExpenseId}
                    expenseDraft={expenseDraft}
                    expensesWithSplits={expensesWithSplits}
                    currentMemberId={currentMember?.id || null}
                    savingExpense={savingExpense}
                    categories={categories}
                    members={members}
                    settings={settings}
                    currency={settings.default_currency}
                    convertedAmount={convertedAmountByExpenseId.get(exp.id) || 0}
                    onToggleVisibility={handleToggleExpenseVisibility}
                    onEdit={openEditExpenseModal}
                    onSave={(expenseId) => void saveExpenseEdit(expenseId)}
                    onCancel={() => setEditingExpenseId(null)}
                    onDelete={(expense) => void deleteExpenseHandler(expense)}
                    onDraftChange={(draft) => setExpenseDraft((current) => ({ ...current, ...draft }))}
                  />
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {sortedExpenses.length === 0 && (
              <Card>
                <p className="text-sm text-zinc-500 text-center">{t("expenses.empty")}</p>
              </Card>
            )}
            {sortedExpenses.map((exp) => (
              <ExpenseListItem
                key={exp.id}
                exp={exp}
                layout="card"
                editingExpenseId={editingExpenseId}
                expenseDraft={expenseDraft}
                expensesWithSplits={expensesWithSplits}
                currentMemberId={currentMember?.id || null}
                savingExpense={savingExpense}
                categories={categories}
                members={members}
                settings={settings}
                currency={settings.default_currency}
                convertedAmount={convertedAmountByExpenseId.get(exp.id) || 0}
                onToggleVisibility={handleToggleExpenseVisibility}
                onEdit={openEditExpenseModal}
                onSave={(expenseId) => void saveExpenseEdit(expenseId)}
                onCancel={() => setEditingExpenseId(null)}
                onDelete={(expense) => void deleteExpenseHandler(expense)}
                onDraftChange={(draft) => setExpenseDraft((current) => ({ ...current, ...draft }))}
                onOpenMenu={(expense, rect) =>
                  setItemMenu((cur) =>
                    cur?.exp.id === expense.id
                      ? null
                      : { exp: expense, top: rect.bottom + 4, right: window.innerWidth - rect.right }
                  )
                }
              />
            ))}
          </div>

          {/* Quem pagou */}
          {payerTotals.length > 0 && (
            <Card className="space-y-4">
              <h3 className="text-sm font-bold">{t("expenses.whoPaidTitle")}</h3>
              <div className="flex items-center gap-4 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className={cn(settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{t("expenses.confirmed")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-blue-400 opacity-50" />
                  <span className={cn(settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{t("expenses.predicted")}</span>
                </div>
              </div>
              <div className="space-y-3">
                {payerTotals.map(({ name, amount, confirmedAmount }) => {
                  const maxAmount = payerTotals[0].amount;
                  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
                  const confirmedPct = maxAmount > 0 ? (confirmedAmount / maxAmount) * 100 : 0;
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={cn("font-medium", settings.dark_mode ? "text-zinc-200" : "text-zinc-700")}>{name}</span>
                        <div className="flex items-center gap-2 text-xs tabular-nums">
                          <span className="text-emerald-600 font-semibold">{formatCurrency(confirmedAmount, settings.default_currency)}</span>
                          <span className={cn(settings.dark_mode ? "text-zinc-500" : "text-zinc-400")}>/</span>
                          <span className={cn("font-medium", settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{formatCurrency(amount, settings.default_currency)}</span>
                        </div>
                      </div>
                      <div className={cn("relative w-full rounded-full h-2.5 overflow-hidden", settings.dark_mode ? "bg-zinc-700" : "bg-zinc-100")}>
                        <div className="absolute h-full rounded-full transition-all duration-500 bg-blue-400 opacity-40" style={{ width: `${pct}%` }} />
                        <div className="absolute h-full rounded-full transition-all duration-500 bg-emerald-500" style={{ width: `${confirmedPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className={cn("text-[10px]", settings.dark_mode ? "text-zinc-500" : "text-zinc-400")}>
                {t("expenses.whoPaidFootnote", { currency: settings.default_currency })}
              </p>
            </Card>
          )}

          <button
            type="button"
            onClick={handleExportExpenses}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors",
              settings.dark_mode
                ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
            )}
          >
            <Download size={16} />
            {t("expenses.exportCsv")}
          </button>
        </>
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ABA: PAGAMENTOS                                */}
      {/* ══════════════════════════════════════════════ */}
      {expenseSubTab === "pagamentos" && currentMember && (
        <div className="space-y-6">
          {isRatesLoading ? (
            <Card className="space-y-2">
              <h3 className="text-sm font-bold">{t("expenses.summaryByParticipant")}</h3>
              <p className={cn("text-sm", settings.dark_mode ? "text-zinc-400" : "text-zinc-600")}>
                Carregando cotações para calcular os saldos...
              </p>
            </Card>
          ) : (
            <>
              <Card className="space-y-4">
                <h3 className="text-sm font-bold">{t("expenses.summaryByParticipant")}</h3>
                <div className="space-y-3">
                  {memberPaymentSummary.map((m) => {
                    const isCredit = m.saldo > 0.01;
                    const isDebt = m.saldo < -0.01;
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "p-3 rounded-xl border border-l-4",
                          settings.dark_mode ? "bg-zinc-800/60 border-zinc-700" : "bg-zinc-50 border-zinc-200"
                        )}
                        style={{
                          borderLeftColor: isCredit ? "#10B981" : isDebt ? "#EF4444" : "var(--card-border)",
                        }}
                      >
                        <p className={cn("text-sm font-bold mb-2", settings.dark_mode ? "text-zinc-100" : "text-zinc-800")}>{m.name}</p>
                        <div className="flex flex-wrap gap-3">
                          <div>
                            <p className={cn("text-[10px] uppercase font-semibold mb-0.5", settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{t("expenses.toReceive")}</p>
                            <p className="text-sm font-semibold text-emerald-600">{formatCurrency(m.aReceber, settings.default_currency)}</p>
                          </div>
                          <div>
                            <p className={cn("text-[10px] uppercase font-semibold mb-0.5", settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{t("expenses.toPay")}</p>
                            <p className="text-sm font-semibold text-red-500">{formatCurrency(m.aPagar, settings.default_currency)}</p>
                          </div>
                          <div className="ml-auto text-right">
                            <p className={cn("text-[10px] uppercase font-semibold mb-0.5", settings.dark_mode ? "text-zinc-400" : "text-zinc-500")}>{t("expenses.balance")}</p>
                            <p className={cn("text-sm font-bold", isCredit ? "text-emerald-600" : isDebt ? "text-red-500" : settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
                              {m.saldo > 0 ? "+" : ""}{formatCurrency(m.saldo, settings.default_currency)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className={cn("text-[10px]", settings.dark_mode ? "text-zinc-500" : "text-zinc-400")}>
                  {t("expenses.bilateralNettingFootnote", { currency: settings.default_currency })}
                </p>
              </Card>

              <Card>
                <BalancesSummary
                  balances={balances}
                  currentUserId={currentMember.user_id}
                  members={members}
                  currency={settings.default_currency}
                  isDark={Boolean(settings.dark_mode)}
                  settlements={settlements}
                  transfers={mergedTransfers}
                  onSettleClick={() => {
                    const simplified = simplifyDebts(rawBalances, settings.default_currency);
                    setTransfers(simplified);
                    setShowSettlement(true);
                  }}
                  onRegisterPayment={registerPayment}
                  onUndoPayment={undoPayment}
                />
              </Card>
            </>
          )}
          <button
            type="button"
            onClick={handleExportPayments}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors",
              settings.dark_mode
                ? "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
            )}
          >
            <Download size={16} />
            {t("expenses.exportCsv")}
          </button>
        </div>
      )}

      <Card className={cn("p-4", settings.dark_mode ? "bg-zinc-900/70" : "bg-white")}>
        <div className="space-y-1">
          <p className={cn("text-xs font-semibold uppercase", settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
            Cotação atual BRL/USD
          </p>
          <p className={cn("text-sm", settings.dark_mode ? "text-zinc-100" : "text-zinc-800")}>
            {brlPerUsd
              ? `1 USD = ${formatCurrency(brlPerUsd, "BRL")} · 1 BRL = ${formatCurrency(1 / brlPerUsd, "USD")}`
              : "Cotação indisponível no momento"}
          </p>
        </div>
        <div className="space-y-1 mt-4">
          <p className={cn("text-xs font-semibold uppercase", settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
            Cotação atual BRL/EUR
          </p>
          <p className={cn("text-sm", settings.dark_mode ? "text-zinc-100" : "text-zinc-800")}>
            {brlPerEur
              ? `1 EUR = ${formatCurrency(brlPerEur, "BRL")} · 1 BRL = ${formatCurrency(1 / brlPerEur, "EUR")}`
              : "Cotação indisponível no momento"}
          </p>
        </div>        
      </Card>

      <FloatingActionButton onClick={onOpenModal} />
      {ConfirmDialogNode}

      {/* Overflow menu do card (Editar / Visibilidade / Excluir) */}
      {itemMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setItemMenu(null)} />
          <div
            className={cn(
              "fixed z-50 w-44 rounded-xl border shadow-lg py-1 overflow-hidden",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"
            )}
            style={{ top: itemMenu.top, right: itemMenu.right }}
          >
            <button
              type="button"
              onClick={() => {
                void openEditExpenseModal(itemMenu.exp);
                setItemMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                settings.dark_mode ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              <FilePenLine size={15} />
              {t("common.edit")}
            </button>
            <button
              type="button"
              onClick={() => {
                handleToggleExpenseVisibility(itemMenu.exp);
                setItemMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                settings.dark_mode ? "text-zinc-200 hover:bg-zinc-700" : "text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {itemMenu.exp.visibility === "public" ? (
                <><Lock size={15} /> {t("expenses.makePrivate")}</>
              ) : (
                <><Users size={15} /> {t("expenses.makePublic")}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                const target = itemMenu.exp;
                setItemMenu(null);
                void deleteExpenseHandler(target);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium transition-colors",
                settings.dark_mode ? "text-red-400 hover:bg-red-950/40" : "text-red-600 hover:bg-red-50"
              )}
            >
              <Trash2 size={15} />
              {t("common.delete")}
            </button>
          </div>
        </>
      )}

      {/* Modal de Quitação */}
      {showSettlement && (
        <TripSettlementModal
          transfers={transfers}
          currency={settings.default_currency}
          onClose={() => setShowSettlement(false)}
          isDark={settings.dark_mode}
          initialCompleted={new Set(
            settlements
              .filter(s => transfers.some(t => t.from_member_id === s.from_member_id && t.to_member_id === s.to_member_id))
              .map(s => `${s.from_member_id}-${s.to_member_id}`)
          )}
          onMarkComplete={async (fromId, toId) => {
            const transfer = transfers.find(t => t.from_member_id === fromId && t.to_member_id === toId);
            if (transfer) {
              const { error } = await supabase.from("settlements").insert({
                trip_id: tripId,
                from_member_id: fromId,
                to_member_id: toId,
                amount: transfer.amount,
                currency: settings.default_currency,
                date: new Date().toISOString(),
                is_confirmed: true,
              });
              if (error) toast(getErrorMessage(error), 'error');
              else await fetchBalanceData();
            }
          }}
          onUnmarkComplete={async (fromId, toId) => {
            const { error } = await supabase
              .from("settlements")
              .delete()
              .eq("trip_id", tripId)
              .eq("from_member_id", fromId)
              .eq("to_member_id", toId);
            if (error) toast(getErrorMessage(error), 'error');
            else await fetchBalanceData();
          }}
          onFinalize={async () => {
            const { error } = await supabase
              .from("trip_settlement_status")
              .upsert({ trip_id: tripId, is_settled: true, settled_at: new Date().toISOString() });
            if (error) toast(getErrorMessage(error), 'error');
            else {
              setShowSettlement(false);
              toast(t("expenses.tripSettledSuccess"), "success");
            }
          }}
        />
      )}

      {/* Modal de edição de despesa */}
      <Modal
        isOpen={showEditExpenseModal}
        onClose={closeEditExpenseModal}
        title={t("expenses.editTitle")}
        size="lg"
        isDark={settings.dark_mode}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await saveEditExpense(new FormData(e.currentTarget));
          }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.description")}</label>
            <input
              name="description"
              defaultValue={editingExpense?.description}
              disabled={isSubmittingExpense}
              required
              placeholder={t("dashboard.descriptionPlaceholderExpense")}
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>

          <select
            name="category_id"
            defaultValue={editingExpense?.category_id || ""}
            disabled={isSubmittingExpense}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          >
            <option value="">{t("dashboard.noCategory")}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.paymentDate")}</label>
              <input
                type="date"
                name="payment_date"
                defaultValue={editingExpense?.payment_date || ""}
                disabled={isSubmittingExpense}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-base sm:text-sm appearance-none disabled:opacity-50 disabled:cursor-not-allowed",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white color-scheme-dark" : "bg-white border-zinc-200"
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.amount")}</label>
              <input
                name="amount"
                disabled={isSubmittingExpense}
                required
                placeholder="0,00"
                value={editExpenseAmount}
                onChange={(e) => setEditExpenseAmount(maskCurrency(e.target.value, settings.language_code))}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-base sm:text-sm disabled:opacity-50",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.currency")}</label>
              <CurrencySelector value={editExpenseCurrency} onChange={setEditExpenseCurrency} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="is_confirmed"
                defaultChecked={editingExpense?.is_confirmed}
                className="rounded border-zinc-300 text-[var(--sidebar-active-bg)] focus:ring-[var(--sidebar-active-bg)]"
              />
              <span>{t("expenses.confirmedExpense")}</span>
            </label>

            <label className={cn("flex items-center gap-2 text-sm cursor-pointer", editExpenseSplits.length > 0 && "opacity-50 pointer-events-none")}>
              <input
                type="checkbox"
                name="visibility"
                value="private"
                defaultChecked={editExpenseSplits.length > 0 ? false : (editingExpense?.visibility === "private")}
                disabled={editExpenseSplits.length > 0}
                className="rounded border-zinc-300 text-[var(--sidebar-active-bg)] focus:ring-[var(--sidebar-active-bg)] disabled:opacity-50"
              />
              <div className={cn("flex items-center gap-1.5 text-zinc-600", editExpenseSplits.length > 0 && "opacity-50")}>
                {editExpenseSplits.length > 0 ? <Unlock size={14} /> : <Lock size={14} />}
                <span>{editExpenseSplits.length > 0 ? t("dashboard.publicRequiredForSplit") : t("dashboard.privateWithSpouse")}</span>
              </div>
            </label>
          </div>

          <div className="border-t pt-4 space-y-4" style={{ borderColor: 'var(--card-border)' }}>
            <h3 className="text-[10px] font-bold uppercase text-zinc-400 px-1">{t("dashboard.split")}</h3>
            <PayerSelector
              members={members}
              selectedPayerId={editExpensePayerId}
              currentUserId={currentMember?.user_id || ""}
              onSelect={setEditExpensePayerId}
            />
            <div className="space-y-2">
              <SplitSelector
                key={`edit-expense-split-${editingExpense?.id || 'new'}`}
                members={members}
                totalAmount={parseCurrencyToNumber(editExpenseAmount) || 0}
                currentUserId={currentMember?.user_id || ""}
                onSplitsChange={(splits, splitType, isValid) => {
                  setEditExpenseSplits(splits);
                  setEditExpenseSplitType(splitType);
                  setIsEditExpenseSplitValid(isValid);
                }}
                initialSplits={editExpenseSplits}
                initialSplitType={editExpenseSplitType}
              />
              {editExpenseSplits.length > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-900 dark:border-sky-800/70 dark:bg-sky-950/40 dark:text-sky-100">
                  <Unlock size={14} className="shrink-0 text-sky-700 dark:text-sky-300" />
                  <p className="text-[10px] font-semibold leading-relaxed text-inherit">
                    {t("dashboard.splitPublicNotice")}
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            disabled={isSubmittingExpense || !isEditExpenseSplitValid}
            className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmittingExpense ? t("common.saving") : t("expenses.saveChanges")}
          </button>
        </form>
      </Modal>

      <VisibilityBottomSheet
        isOpen={visibilitySheet.open}
        currentVisibility={visibilitySheet.currentVisibility}
        onConfirm={() => visibilitySheet.onConfirm?.()}
        onClose={() => setVisibilitySheet(prev => ({ ...prev, open: false }))}
        isDark={settings.dark_mode}
      />
    </motion.div>
  );
}
