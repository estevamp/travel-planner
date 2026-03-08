import React from "react";
import {
  CheckCircle2,
  Circle,
  FilePenLine,
  Lock,
  Trash2,
  Users,
} from "lucide-react";
import { cn, formatCurrency, maskCurrency } from "../utils";
import { Card } from "./Card";
import type {
  Expense,
  ExpenseCategory,
  TripMember,
  UserSettings,
} from "../types";
import type { ExpenseWithSplits } from "../types/splitting";

export interface ExpenseDraft {
  description: string;
  category_id: string;
  amount: string;
  visibility: "public" | "private";
  is_confirmed: boolean;
}

interface ExpenseListItemProps {
  exp: Expense;
  layout: "table" | "card";
  editingExpenseId: string | null;
  expenseDraft: ExpenseDraft;
  expensesWithSplits: ExpenseWithSplits[];
  savingExpense: boolean;
  categories: ExpenseCategory[];
  members: TripMember[];
  settings: UserSettings;
  currency: string;
  convertedAmount: number;
  onToggleVisibility: (exp: Expense) => void;
  onEdit: (exp: Expense) => void;
  onSave: (expenseId: string) => void;
  onCancel: () => void;
  onDelete: (exp: Expense) => void;
  onDraftChange: (draft: Partial<ExpenseDraft>) => void;
}

export function ExpenseListItem({
  exp,
  layout,
  editingExpenseId,
  expenseDraft,
  expensesWithSplits,
  savingExpense,
  categories,
  members,
  settings,
  currency,
  convertedAmount,
  onToggleVisibility,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onDraftChange,
}: ExpenseListItemProps) {
  const isEditing = editingExpenseId === exp.id;
  const expWithSplits = expensesWithSplits.find((entry) => entry.id === exp.id);
  const hasSplits = Boolean(expWithSplits?.splits?.length);
  const visibilityTitle = hasSplits
    ? "Despesas com rateio devem ser públicas"
    : exp.visibility === "private"
    ? "Privado (você e cônjuge)"
    : "Público (todos os membros)";

  const splitSummary =
    expWithSplits && expWithSplits.splits && expWithSplits.splits.length > 0 ? (
      <div className="mt-1 space-y-0.5">
        <p className="text-[10px] text-zinc-400 leading-tight">
          Pago por{" "}
          <span className="font-medium text-zinc-500">
            {members.find((m) => m.id === expWithSplits.paid_by_member_id)
              ?.display_name || "Desconhecido"}
          </span>
        </p>
        <p className="text-[10px] text-zinc-400 leading-tight">
          {expWithSplits.splits.map((split, index) => (
            <span key={split.member_id}>
              {index > 0 && " · "}
              <span className="font-medium text-zinc-500">
                {members.find((m) => m.id === split.member_id)?.display_name || "?"}
              </span>
              {": "}
              {formatCurrency(split.amount, exp.currency || currency)}
            </span>
          ))}
        </p>
      </div>
    ) : null;

  const visibilityButton = (
    <button
      onClick={() => onToggleVisibility(exp)}
      className={cn(
        "text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed",
        exp.visibility === "public"
          ? "bg-blue-100 text-blue-700"
          : "bg-zinc-100 text-zinc-500"
      )}
      disabled={hasSplits}
      title={layout === "table" ? visibilityTitle : undefined}
    >
      {exp.visibility === "public" ? (
        <>
          <Users size={10} /> Público
        </>
      ) : (
        <>
          <Lock size={10} /> Privado
        </>
      )}
    </button>
  );

  if (layout === "table") {
    return (
      <tr>
        {isEditing ? (
          <>
            <td className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={expenseDraft.description}
                  onChange={(e) => onDraftChange({ description: e.target.value })}
                  placeholder="Descricao"
                  className={cn(
                    "flex-1 px-3 py-2 rounded-xl border text-sm",
                    settings.dark_mode
                      ? "bg-zinc-800 border-zinc-700 text-white"
                      : "bg-white border-zinc-200"
                  )}
                />
                <label className="flex items-center gap-1 text-xs uppercase cursor-pointer" title="Confirmada">
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={expenseDraft.is_confirmed}
                    onChange={(e) => onDraftChange({ is_confirmed: e.target.checked })}
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
                onChange={(e) => onDraftChange({ category_id: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-sm",
                  settings.dark_mode
                    ? "bg-zinc-800 border-zinc-700 text-white"
                    : "bg-white border-zinc-200"
                )}
              >
                <option value="">Sem categoria</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </td>
            <td className="px-4 py-3">
              <input
                value={expenseDraft.amount}
                onChange={(e) => onDraftChange({ amount: maskCurrency(e.target.value) })}
                placeholder="Valor"
                className={cn(
                  "w-full px-3 py-2 rounded-xl border text-sm",
                  settings.dark_mode
                    ? "bg-zinc-800 border-zinc-700 text-white"
                    : "bg-white border-zinc-200"
                )}
              />
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={savingExpense}
                  onClick={() => onSave(exp.id)}
                  className="px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-xs font-bold"
                >
                  {savingExpense ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  disabled={savingExpense}
                  onClick={onCancel}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-xs font-bold",
                    settings.dark_mode
                      ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                      : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  )}
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
                <span
                  className="flex items-center gap-1"
                  style={{ color: exp.category.color || "inherit" }}
                >
                  {exp.category.name}
                </span>
              ) : (
                <span className="text-zinc-400">Geral</span>
              )}
            </td>
            <td className="px-4 py-3">
              <div className="flex flex-col">
                <span className="font-bold">
                  {formatCurrency(exp.amount, exp.currency || currency)}
                </span>
                {exp.currency && exp.currency !== currency && (
                  <span className="text-[10px] text-zinc-500">
                    ≈ {formatCurrency(convertedAmount, currency)}
                  </span>
                )}
                {splitSummary}
              </div>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex items-center justify-end gap-2">
                {!editingExpenseId && (
                  <>
                    {visibilityButton}
                    <button
                      type="button"
                      onClick={() => onEdit(exp)}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      <FilePenLine size={16} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onDelete(exp)}
                  className="text-zinc-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </td>
          </>
        )}
      </tr>
    );
  }

  return (
    <Card className="space-y-3">
      {isEditing ? (
        <>
          <div className="space-y-3">
            <input
              value={expenseDraft.description}
              onChange={(e) => onDraftChange({ description: e.target.value })}
              placeholder="Descricao"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode
                  ? "bg-zinc-800 border-zinc-700 text-white"
                  : "bg-white border-zinc-200"
              )}
            />
            <select
              value={expenseDraft.category_id}
              onChange={(e) => onDraftChange({ category_id: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode
                  ? "bg-zinc-800 border-zinc-700 text-white"
                  : "bg-white border-zinc-200"
              )}
            >
              <option value="">Sem categoria</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <input
              value={expenseDraft.amount}
              onChange={(e) => onDraftChange({ amount: maskCurrency(e.target.value) })}
              placeholder="Valor"
              className={cn(
                "w-full px-3 py-2 rounded-xl border text-sm",
                settings.dark_mode
                  ? "bg-zinc-800 border-zinc-700 text-white"
                  : "bg-white border-zinc-200"
              )}
            />
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={expenseDraft.is_confirmed}
                  onChange={(e) => onDraftChange({ is_confirmed: e.target.checked })}
                />
                Marcar como confirmada
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingExpense}
              onClick={() => onSave(exp.id)}
              className="flex-1 px-3 py-2 rounded-xl bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] text-sm font-bold"
            >
              {savingExpense ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              disabled={savingExpense}
              onClick={onCancel}
              className={cn(
                "flex-1 px-3 py-2 rounded-xl border text-sm font-bold",
                settings.dark_mode
                  ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
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
                <span
                  className="inline-flex items-center gap-1 text-xs uppercase"
                  style={{ color: exp.category.color || "inherit" }}
                >
                  {exp.category.name}
                </span>
              ) : (
                <span className="text-xs uppercase text-zinc-400">Geral</span>
              )}
              <div className="flex flex-col">
                <span className="font-bold text-base">
                  {formatCurrency(exp.amount, exp.currency || currency)}
                </span>
                {exp.currency && exp.currency !== currency && (
                  <span className="text-[10px] text-zinc-500">
                    ≈ {formatCurrency(convertedAmount, currency)}
                  </span>
                )}
                {splitSummary}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            {!editingExpenseId && (
              <>
                {visibilityButton}
                <button
                  type="button"
                  onClick={() => onEdit(exp)}
                  className="p-2 text-zinc-400 hover:text-zinc-700"
                >
                  <FilePenLine size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => onDelete(exp)}
              className="p-2 text-zinc-400 hover:text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
