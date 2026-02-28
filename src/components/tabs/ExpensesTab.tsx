import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { useTripContext } from "../../context/TripContext";
import { FilePenLine, Trash2, Lock, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber } from "../../utils";
import type { Trip, Expense, Visibility, CreateExpenseSplitInput, SplitType } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { Modal } from "../Modal";
import { CurrencySelector } from "../CurrencySelector";
import { PayerSelector } from "../PayerSelector";
import { SplitSelector } from "../SplitSelector";
import { useCurrencyConversion } from "../../hooks/useCurrencyConversion";

interface ExpensesTabProps {
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function ExpensesTab({ onOpenModal, onSetActiveTab, onTripUpdate }: ExpensesTabProps) {
  const { trip, currentMember, members, categories, settings, tripBudget } = useTripContext();
  const { toast } = useToast();
  const { confirm, ConfirmDialogNode } = useConfirm();
  const { convert } = useCurrencyConversion(settings.default_currency);
  const [isBudgetExpanded, setIsBudgetExpanded] = useState(false);

  const convertedExpenses = useMemo(() => {
    return trip.expenses.map(exp => {
      const currency = exp.currency || settings.default_currency;
      const convertedAmount = convert(Number(exp.amount) || 0, currency);

      return {
        ...exp,
        convertedAmount
      };
    });
  }, [trip.expenses, settings.default_currency, convert]);

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseDraft, setExpenseDraft] = useState<{
    description: string;
    category_id: string;
    amount: string;
    visibility: Visibility;
    is_confirmed: boolean;
  }>({
    description: "",
    category_id: "",
    amount: "0",
    visibility: "public",
    is_confirmed: false,
  });

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

  const startEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setExpenseDraft({
      description: expense.description,
      category_id: expense.category_id || "",
      amount: maskCurrency(String((expense.amount || 0) * 100)),
      visibility: expense.visibility,
      is_confirmed: expense.is_confirmed,
    });
  };

  const saveExpenseEdit = async (expenseId: string) => {
    if (!editingExpenseId || editingExpenseId !== expenseId || savingExpense) return;
    const description = expenseDraft.description.trim();
    if (!description) return;
    const nextAmount = parseCurrencyToNumber(expenseDraft.amount) || 0;

    setSavingExpense(true);

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
              visibility: expenseDraft.visibility,
              is_confirmed: expenseDraft.is_confirmed,
              category: expenseDraft.category_id ? categories.find(c => c.id === expenseDraft.category_id) || null : null
            }
          : exp
      ),
    }));

    const { error } = await supabase
      .from("expenses")
      .update({
        description,
        category_id: expenseDraft.category_id || null,
        amount: nextAmount,
        visibility: expenseDraft.visibility,
        is_confirmed: expenseDraft.is_confirmed,
      })
      .eq("id", expenseId);
    
    setSavingExpense(false);

    if (error) {
      toast(getErrorMessage(error), 'error');
      return;
    }

    setEditingExpenseId(null);
  };

  const openEditExpenseModal = async (expense: Expense) => {
    setEditingExpense(expense);
    setEditExpenseAmount(maskCurrency(String((expense.amount || 0) * 100)));
    setEditExpenseCurrency(expense.currency || settings.default_currency);
    
    // Buscar dados extras da despesa (pagador e tipo de rateio)
    const { data: expenseData } = await supabase
      .from("expenses")
      .select("paid_by_member_id, split_type")
      .eq("id", expense.id)
      .single();
    
    if (expenseData) {
      setEditExpensePayerId(expenseData.paid_by_member_id || currentMember?.id || "");
      setEditExpenseSplitType(expenseData.split_type || "equal");
    } else {
      setEditExpensePayerId(currentMember?.id || "");
      setEditExpenseSplitType("equal");
    }

    // Buscar splits existentes
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
    
    setIsSubmittingExpense(true);
    try {
      const visibility = "public";
      const amount = parseCurrencyToNumber(form.get("amount") as string) || 0;
      const description = (form.get("description") as string) || "Despesa";
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
                category: category_id ? categories.find(c => c.id === category_id) || null : null
              }
            : exp
        ),
      }));

      const { error } = await supabase
        .from("expenses")
        .update({
          description,
          amount,
          currency: editExpenseCurrency,
          category_id,
          visibility,
          is_confirmed,
          paid_by_member_id: editExpensePayerId,
          split_type: editExpenseSplitType,
        })
        .eq("id", editingExpense.id);
      
      if (error) {
        toast(getErrorMessage(error), 'error');
      } else {
        // Deletar splits antigos
        await supabase.from("expense_splits").delete().eq("expense_id", editingExpense.id);

        // Salvar novos splits se houver e for pública
        if (editExpenseSplits.length > 0 && visibility === "public") {
          const { error: splitsError } = await supabase.from("expense_splits").insert(
            editExpenseSplits.map(split => ({
              expense_id: editingExpense.id,
              member_id: split.member_id,
              amount: split.amount || 0,
              percentage: split.percentage,
            }))
          );
          
          if (splitsError) {
            console.error("Erro ao salvar splits na edição:", splitsError);
          }
        }
        
        closeEditExpenseModal();
      }
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const deleteExpense = async (expense: Expense) => {
    const confirmed = await confirm({
      title: 'Remover despesa?',
      message: `Remover a despesa "${expense.description}"? Esta ação não pode ser desfeita.`,
      variant: 'danger',
      isDark: settings.dark_mode
    });
    if (!confirmed) return;

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((exp) => exp.id !== expense.id),
    }));

    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      toast(getErrorMessage(error), 'error');
    }
  };

  const confirmedTotal = convertedExpenses
    .filter(expense => expense.is_confirmed)
    .reduce((total, expense) => total + expense.convertedAmount, 0);
  const predictedTotal = convertedExpenses.reduce((total, expense) => total + expense.convertedAmount, 0);
  const budgetLimit = Math.max(0, Number(tripBudget?.budget_limit) || 0);
  const confirmedProgress = budgetLimit > 0 ? Math.min((confirmedTotal / budgetLimit) * 100, 100) : 0;
  const predictedProgress = budgetLimit > 0 ? Math.min((predictedTotal / budgetLimit) * 100, 100) : 0;
  const budgetRemaining = budgetLimit - predictedTotal;
  const isOverBudget = budgetLimit > 0 && predictedTotal > budgetLimit;

  return (
    <motion.div key="expenses" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
      {/* Budget Overview Card */}
      <Card
        className={cn(
          "border-2",
          settings.dark_mode
            ? "bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 border-zinc-700"
            : "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200"
        )}
      >
        <div className="space-y-4">
          {/* LAYOUT: header responsivo — empilha no mobile, lado a lado no sm+ */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 className={cn("text-lg font-bold", settings.dark_mode ? "text-zinc-300" : "text-zinc-600")}>
                Orçamento da Viagem
              </h3>
              <p className={cn("text-sm mt-1", settings.dark_mode ? "text-zinc-500" : "text-zinc-400")}>
                {budgetLimit > 0
                  ? `Limite: ${formatCurrency(budgetLimit, settings.default_currency)}`
                  : "Nenhum orçamento definido"}
              </p>
            </div>
            {/* LAYOUT: valores lado a lado no mobile, coluna no sm+ */}
            <div className="flex sm:flex-col gap-4 sm:gap-1 sm:text-right">
              <div>
                <p className={cn("text-xs", settings.dark_mode ? "text-zinc-500" : "text-zinc-500")}>Confirmado</p>
                <p className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums">
                  {formatCurrency(confirmedTotal, settings.default_currency)}
                </p>
              </div>
              <div>
                <p className={cn("text-xs", settings.dark_mode ? "text-zinc-500" : "text-zinc-500")}>Total Previsto</p>
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
                  : "text-zinc-400 hover:text-zinc-600 border-blue-100"
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {isBudgetExpanded ? "Recolher Detalhes" : "Ver Detalhes do Orçamento"}
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
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className={settings.dark_mode ? "text-zinc-400" : "text-zinc-600"}>Progresso</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-600">
                      Confirmado: {confirmedProgress.toFixed(1)}%
                    </span>
                    <span className={cn(
                      "font-bold",
                      isOverBudget ? "text-red-600" : (settings.dark_mode ? "text-blue-400" : "text-blue-600")
                    )}>
                      Previsto: {predictedProgress.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="relative h-4 rounded-full overflow-hidden border-2 shadow-inner" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                  {/* Confirmed expenses bar */}
                  <div
                    className="absolute h-full transition-all duration-500 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600"
                    style={{ width: `${Math.min(confirmedProgress, 100)}%` }}
                  />
                  {/* Predicted expenses bar (semi-transparent overlay) */}
                  <div
                    className={cn(
                      "absolute h-full transition-all duration-500 rounded-full opacity-40",
                      isOverBudget
                        ? "bg-gradient-to-r from-red-500 to-red-600"
                        : "bg-gradient-to-r from-blue-500 to-blue-600"
                    )}
                    style={{ width: `${Math.min(predictedProgress, 100)}%` }}
                  />
                </div>
              </div>

              {/* Remaining Budget */}
              <div className={cn(
                "p-4 rounded-xl border-2",
                isOverBudget
                  ? (settings.dark_mode ? "bg-red-950/30 border-red-900/50" : "bg-red-50 border-red-300")
                  : (settings.dark_mode ? "bg-emerald-950/30 border-emerald-900/50" : "bg-emerald-50 border-emerald-300")
              )}>
                {/* LAYOUT: flex-wrap para não quebrar em telas estreitas */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold", settings.dark_mode ? "text-zinc-300" : "text-zinc-700")}>
                    {isOverBudget ? "Acima do orçamento" : "Restante"}
                  </span>
                  <span className={cn(
                    "text-lg sm:text-xl font-bold tabular-nums",
                    isOverBudget ? "text-red-600" : "text-emerald-600"
                  )}>
                    {isOverBudget ? "-" : ""}{formatCurrency(Math.abs(budgetRemaining), settings.default_currency)}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {budgetLimit === 0 && (
            <div className="p-4 rounded-xl border-2" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
              <p className={cn("text-sm text-center", settings.dark_mode ? "text-zinc-400" : "text-zinc-600")}>
                💡 Defina um orçamento nas <button
                  onClick={() => onSetActiveTab("settings")}
                  className={cn("font-semibold hover:underline", settings.dark_mode ? "text-blue-400" : "text-blue-600")}
                >Configurações</button> para acompanhar seus gastos
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Desktop table view */}
      <Card className="p-0 overflow-hidden hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead><tr className={settings.dark_mode ? "bg-zinc-800/50" : "bg-zinc-50"}><th className="px-4 py-3 text-xs uppercase">Descricao</th><th className="px-4 py-3 text-xs uppercase">Categoria</th><th className="px-4 py-3 text-xs uppercase">Valor</th><th className="px-4 py-3 text-xs uppercase text-right">Acao</th></tr></thead>
          <tbody className={cn("divide-y", settings.dark_mode ? "divide-zinc-800" : "divide-zinc-100")}>
            {trip.expenses.map((exp) => (
              <tr key={exp.id}>
                {editingExpenseId === exp.id ? (
                  <>
                    <td className="px-4 py-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={expenseDraft.description}
                          onChange={(e) => setExpenseDraft((current) => ({ ...current, description: e.target.value }))}
                          placeholder="Descricao"
                          className={cn("flex-1 px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                        />
                        <label className="flex items-center gap-1 text-xs uppercase cursor-pointer" title="Confirmada">
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={expenseDraft.is_confirmed}
                            onChange={(e) => setExpenseDraft((current) => ({ ...current, is_confirmed: e.target.checked }))}
                          />
                          {expenseDraft.is_confirmed ? (
                            <CheckCircle2 size={16} className="text-emerald-600" />
                          ) : (
                            <Circle size={16} className="text-zinc-300" />
                          )}
                        </label>
                      </div>
                      <p className="text-xs text-zinc-400">{exp.date}</p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={expenseDraft.category_id}
                        onChange={(e) => setExpenseDraft((current) => ({ ...current, category_id: e.target.value }))}
                        className={cn("w-full px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={expenseDraft.amount}
                        onChange={(e) => setExpenseDraft((current) => ({ ...current, amount: maskCurrency(e.target.value) }))}
                        placeholder="Valor"
                        className={cn("w-full px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={savingExpense}
                          onClick={() => void saveExpenseEdit(exp.id)}
                          className="px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-xs font-bold"
                        >
                          {savingExpense ? "Salvando..." : "Salvar"}
                        </button>
                        <button
                          type="button"
                          disabled={savingExpense}
                          onClick={() => setEditingExpenseId(null)}
                          className={cn("px-3 py-2 rounded-xl border text-xs font-bold", settings.dark_mode ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{exp.description}</p>
                        {exp.is_confirmed ? (
                          <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" title="Confirmada" />
                        ) : (
                          <Circle size={14} className="text-zinc-400 flex-shrink-0" title="Prevista" />
                        )}
                      </div>
                      <p className="text-xs text-zinc-400">{exp.date}</p>
                    </td>
                    <td className="px-4 py-3 text-xs uppercase">
                      {exp.category ? (
                        <span className="flex items-center gap-1" style={{ color: exp.category.color || 'inherit' }}>
                          {exp.category.name}
                        </span>
                      ) : (
                        <span className="text-zinc-400">Geral</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold">{formatCurrency(exp.amount, exp.currency || settings.default_currency)}</span>
                        {exp.currency && exp.currency !== settings.default_currency && (
                          <span className="text-[10px] text-zinc-500">
                            ≈ {formatCurrency(convertedExpenses.find(e => e.id === exp.id)?.convertedAmount || 0, settings.default_currency)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!editingExpenseId && (
                          <button type="button" onClick={() => openEditExpenseModal(exp)} className="text-zinc-400 hover:text-zinc-700">
                            <FilePenLine size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => void deleteExpense(exp)}
                          className="text-zinc-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {trip.expenses.length === 0 && (
          <Card>
            <p className="text-sm text-zinc-500 text-center">Nenhuma despesa cadastrada.</p>
          </Card>
        )}
        {trip.expenses.map((exp) => (
          <Card key={exp.id} className="space-y-3">
            {editingExpenseId === exp.id ? (
              <>
                <div className="space-y-3">
                  <input
                    value={expenseDraft.description}
                    onChange={(e) => setExpenseDraft((current) => ({ ...current, description: e.target.value }))}
                    placeholder="Descricao"
                    className={cn("w-full px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                  />
                  <select
                    value={expenseDraft.category_id}
                    onChange={(e) => setExpenseDraft((current) => ({ ...current, category_id: e.target.value }))}
                    className={cn("w-full px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    value={expenseDraft.amount}
                    onChange={(e) => setExpenseDraft((current) => ({ ...current, amount: maskCurrency(e.target.value) }))}
                    placeholder="Valor"
                    className={cn("w-full px-3 py-2 rounded-xl border text-sm", settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200")}
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={expenseDraft.is_confirmed}
                        onChange={(e) => setExpenseDraft((current) => ({ ...current, is_confirmed: e.target.checked }))}
                      />
                      Marcar como confirmada
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingExpense}
                    onClick={() => void saveExpenseEdit(exp.id)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold"
                  >
                    {savingExpense ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    type="button"
                    disabled={savingExpense}
                    onClick={() => setEditingExpenseId(null)}
                    className={cn("flex-1 px-3 py-2 rounded-xl border text-sm font-bold", settings.dark_mode ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50")}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold truncate">{exp.description}</h4>
                      {exp.is_confirmed ? (
                        <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" title="Confirmada" />
                      ) : (
                        <Circle size={14} className="text-zinc-400 flex-shrink-0" title="Prevista" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 mb-2">{exp.date}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      {exp.category ? (
                        <span className="inline-flex items-center gap-1 text-xs uppercase" style={{ color: exp.category.color || 'inherit' }}>
                          {exp.category.name}
                        </span>
                      ) : (
                        <span className="text-xs uppercase text-zinc-400">Geral</span>
                      )}
                      <div className="flex flex-col">
                        <span className="font-bold text-base">{formatCurrency(exp.amount, exp.currency || settings.default_currency)}</span>
                        {exp.currency && exp.currency !== settings.default_currency && (
                          <span className="text-[10px] text-zinc-500">
                            ≈ {formatCurrency(convertedExpenses.find(e => e.id === exp.id)?.convertedAmount || 0, settings.default_currency)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    {!editingExpenseId && (
                      <button
                        type="button"
                        onClick={() => openEditExpenseModal(exp)}
                        className="p-2 text-zinc-400 hover:text-zinc-700"
                      >
                        <FilePenLine size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => void deleteExpense(exp)}
                      className="p-2 text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Card>
        ))}
      </div>

      <FloatingActionButton onClick={onOpenModal} />
      {ConfirmDialogNode}

      {/* Modal de Edição Completo (com splits) */}
      <Modal
        isOpen={showEditExpenseModal}
        onClose={closeEditExpenseModal}
        title="Editar Despesa"
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
            <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Descrição</label>
            <input
              name="description"
              disabled={isSubmittingExpense}
              required
              defaultValue={editingExpense?.description}
              placeholder="Ex: Almoço"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
              )}
            />
          </div>
          
          <select
            name="category_id"
            disabled={isSubmittingExpense}
            defaultValue={editingExpense?.category_id || ""}
            className={cn(
              "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
              settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
            )}
          >
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1 required-indicator">Valor</label>
              <input
                name="amount"
                disabled={isSubmittingExpense}
                required
                placeholder="0,00"
                value={editExpenseAmount}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-sm disabled:opacity-50 disabled:cursor-not-allowed",
                  settings.dark_mode ? "bg-zinc-800 border-zinc-700 text-white" : "bg-white border-zinc-200"
                )}
                onChange={(e) => {
                  const masked = maskCurrency(e.target.value);
                  setEditExpenseAmount(masked);
                  e.target.value = masked;
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-zinc-400 px-1">Moeda</label>
              <CurrencySelector
                value={editExpenseCurrency}
                onChange={setEditExpenseCurrency}
                disabled={isSubmittingExpense}
              />
            </div>
          </div>
          
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_confirmed"
              disabled={isSubmittingExpense}
              defaultChecked={editingExpense?.is_confirmed}
            />
            Marcar como confirmada
          </label>
          
          {/* Seção de Rateio */}
          <div className="border-t pt-4 space-y-4" style={{ borderColor: 'var(--card-border)' }}>
            <h3 className="text-[10px] font-bold uppercase text-zinc-400 px-1">Rateio</h3>
            
            <PayerSelector
              members={members}
              selectedPayerId={editExpensePayerId}
              currentUserId={currentMember?.user_id || ""}
              onSelect={setEditExpensePayerId}
            />
            
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
          </div>
          
          <button
            disabled={isSubmittingExpense || !isEditExpenseSplitValid}
            className="w-full bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmittingExpense ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>
      </Modal>
    </motion.div>
  );
}
