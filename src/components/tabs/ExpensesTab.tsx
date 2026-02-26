import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { FilePenLine, Trash2, Lock, CheckCircle2, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../../supabase";
import { cn, getErrorMessage, formatCurrency, maskCurrency, parseCurrencyToNumber } from "../../utils";
import type { Trip, Expense, ExpenseCategory, TripMember, UserSettings, Visibility, TripBudget } from "../../types";
import { Card } from "../Card";
import { FloatingActionButton } from "../FloatingActionButton";
import { currencyService } from "../../services/currencyService";

interface ExpensesTabProps {
  trip: Trip;
  currentMember: TripMember | null;
  categories: ExpenseCategory[];
  settings: UserSettings;
  tripBudget: TripBudget | null;
  onOpenModal: () => void;
  onSetActiveTab: (tab: string) => void;
  onTripUpdate: (updater: (prev: Trip) => Trip) => void;
}

export function ExpensesTab({ trip, currentMember, categories, settings, tripBudget, onOpenModal, onSetActiveTab, onTripUpdate }: ExpensesTabProps) {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [isBudgetExpanded, setIsBudgetExpanded] = useState(false);

  useEffect(() => {
    const fetchRates = async () => {
      const data = await currencyService.getExchangeRates(settings.default_currency);
      setRates(data.rates);
    };
    fetchRates();
  }, [settings.default_currency]);

  const convertedExpenses = useMemo(() => {
    return trip.expenses.map(exp => {
      const currency = exp.currency || settings.default_currency;
      let convertedAmount = Number(exp.amount) || 0;
      
      if (currency !== settings.default_currency && rates[currency]) {
        convertedAmount = (Number(exp.amount) || 0) / rates[currency];
      }

      return {
        ...exp,
        convertedAmount
      };
    });
  }, [trip.expenses, settings.default_currency, rates]);

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
      alert(getErrorMessage(error));
      return;
    }

    setEditingExpenseId(null);
  };

  const deleteExpense = async (expense: Expense) => {
    const confirmed = window.confirm(`Remover a despesa "${expense.description}"?`);
    if (!confirmed) return;

    // Optimistic update
    onTripUpdate((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((exp) => exp.id !== expense.id),
    }));

    const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
    if (error) {
      alert(getErrorMessage(error));
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
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-zinc-600">Orçamento da Viagem</h3>
              <p className="text-sm text-zinc-400 mt-1">
                {budgetLimit > 0
                  ? `${formatCurrency(budgetLimit, settings.default_currency)}`
                  : "Nenhum orçamento definido"}
              </p>
            </div>
            <div className="text-right space-y-1">
              <div>
                <p className="text-xs text-zinc-500">Confirmado</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(confirmedTotal, settings.default_currency)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Total Previsto</p>
                <p className="text-xl font-bold text-zinc-600">{formatCurrency(predictedTotal, settings.default_currency)}</p>
              </div>
            </div>
          </div>

          {budgetLimit > 0 && (
            <button
              onClick={() => setIsBudgetExpanded(!isBudgetExpanded)}
              className="w-full flex items-center justify-center gap-2 py-1 text-zinc-400 hover:text-zinc-600 transition-colors border-t border-blue-100 mt-2"
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
                  <span className="text-zinc-600">Progresso</span>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-600">
                      Confirmado: {confirmedProgress.toFixed(1)}%
                    </span>
                    <span className={cn(
                      "font-bold",
                      isOverBudget ? "text-red-600" : "text-blue-600"
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

              {/* Budget vs Expenses Comparison Chart */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-600 uppercase">Orçamento</p>
                  <div className="relative h-16 sm:h-32 rounded-xl border-2 border-blue-300 overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }}>
                    <div
                      className="absolute inset-0 bg-gradient-to-r sm:bg-gradient-to-t from-blue-500 to-blue-400 transition-all duration-500"
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-1">
                      <span className="text-sm font-bold text-white drop-shadow-lg text-center break-all">
                        {formatCurrency(budgetLimit, settings.default_currency)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-600 uppercase">Confirmado</p>
                  <div className="relative h-16 sm:h-32 rounded-xl border-2 border-emerald-300 overflow-hidden" style={{ backgroundColor: 'var(--card-bg)' }}>
                    <div
                      className="absolute inset-y-0 left-0 sm:inset-x-0 sm:bottom-0 bg-gradient-to-r sm:bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{ width: `var(--progress-mobile, ${Math.min((confirmedTotal / budgetLimit) * 100, 100)}%)`, height: `var(--progress-desktop, 100%)` }}
                    />
                    {/* CSS variables to handle responsive bar direction */}
                    <style dangerouslySetInnerHTML={{ __html: `
                      @media (max-width: 639px) {
                        .confirmed-bar { --progress-mobile: ${Math.min((confirmedTotal / budgetLimit) * 100, 100)}%; --progress-desktop: 100%; }
                      }
                      @media (min-width: 640px) {
                        .confirmed-bar { --progress-mobile: 100%; --progress-desktop: ${Math.min((confirmedTotal / budgetLimit) * 100, 100)}%; }
                      }
                    `}} />
                    <div
                      className="confirmed-bar absolute inset-0 bg-gradient-to-r sm:bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all duration-500"
                      style={{
                        width: 'var(--progress-mobile)',
                        height: 'var(--progress-desktop)',
                        bottom: 0,
                        left: 0
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-1">
                      <span className={cn(
                        "text-sm font-bold drop-shadow-lg text-center break-all",
                        (confirmedTotal / budgetLimit) > 0.5 ? "text-white" : "text-zinc-800"
                      )}>
                        {formatCurrency(confirmedTotal, settings.default_currency)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-600 uppercase">Previsto</p>
                  <div className="relative h-16 sm:h-32 rounded-xl border-2 overflow-hidden" style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}>
                    <style dangerouslySetInnerHTML={{ __html: `
                      @media (max-width: 639px) {
                        .predicted-bar { --progress-mobile: ${Math.min((predictedTotal / budgetLimit) * 100, 100)}%; --progress-desktop: 100%; }
                      }
                      @media (min-width: 640px) {
                        .predicted-bar { --progress-mobile: 100%; --progress-desktop: ${Math.min((predictedTotal / budgetLimit) * 100, 100)}%; }
                      }
                    `}} />
                    <div
                      className={cn(
                        "predicted-bar absolute inset-0 transition-all duration-500",
                        isOverBudget
                          ? "bg-gradient-to-r sm:bg-gradient-to-t from-red-500 to-red-400"
                          : "bg-gradient-to-r sm:bg-gradient-to-t from-blue-500 to-blue-400"
                      )}
                      style={{
                        width: 'var(--progress-mobile)',
                        height: 'var(--progress-desktop)',
                        bottom: 0,
                        left: 0
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center p-1">
                      <span className={cn(
                        "text-sm font-bold drop-shadow-lg text-center break-all",
                        (predictedTotal / budgetLimit) > 0.5 ? "text-white" : "text-zinc-800"
                      )}>
                        {formatCurrency(predictedTotal, settings.default_currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remaining Budget */}
              <div className={cn(
                "p-4 rounded-xl border-2",
                isOverBudget
                  ? "bg-red-50 border-red-300"
                  : "bg-emerald-50 border-emerald-300"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-700">
                    {isOverBudget ? "Acima do orçamento" : "Restante"}
                  </span>
                  <span className={cn(
                    "text-xl font-bold",
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
              <p className="text-sm text-zinc-600 text-center">
                💡 Defina um orçamento nas <button
                  onClick={() => onSetActiveTab("settings")}
                  className="text-blue-600 font-semibold hover:underline"
                >Configurações</button> para acompanhar seus gastos
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Desktop table view */}
      <Card className="p-0 overflow-hidden hidden md:block">
        <table className="w-full text-left border-collapse">
          <thead><tr className="bg-zinc-50"><th className="px-4 py-3 text-xs uppercase">Descricao</th><th className="px-4 py-3 text-xs uppercase">Categoria</th><th className="px-4 py-3 text-xs uppercase">Valor</th><th className="px-4 py-3 text-xs uppercase text-right">Acao</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
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
                          className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                        />
                        <label className="flex items-center gap-1 text-xs uppercase cursor-pointer" title="Privado">
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={expenseDraft.visibility === "private"}
                            onChange={(e) => setExpenseDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                          />
                          <Lock size={16} className={cn("transition-colors", expenseDraft.visibility === "private" ? "text-orange-600" : "text-zinc-300")} />
                        </label>
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
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
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
                        className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
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
                          className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-bold"
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
                        {exp.visibility === "private" && (
                          <Lock size={14} className="text-orange-600 flex-shrink-0" title="Privado" />
                        )}
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
                        <button type="button" onClick={() => startEditExpense(exp)} className="text-zinc-400 hover:text-zinc-700">
                          <FilePenLine size={16} />
                        </button>
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
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                  />
                  <select
                    value={expenseDraft.category_id}
                    onChange={(e) => setExpenseDraft((current) => ({ ...current, category_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
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
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm"
                  />
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={expenseDraft.visibility === "private"}
                        onChange={(e) => setExpenseDraft((current) => ({ ...current, visibility: e.target.checked ? "private" : "public" }))}
                      />
                      Marcar como privado
                    </label>
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
                    className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-sm font-bold"
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
                      {exp.visibility === "private" && (
                        <Lock size={14} className="text-orange-600 flex-shrink-0" title="Privado" />
                      )}
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
                    <button
                      type="button"
                      onClick={() => startEditExpense(exp)}
                      className="p-2 text-zinc-400 hover:text-zinc-700"
                    >
                      <FilePenLine size={16} />
                    </button>
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
    </motion.div>
  );
}
