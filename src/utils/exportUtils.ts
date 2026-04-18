import type { Expense, ExpenseCategory, TripMember } from "../types";
import { formatCurrency } from "./index";

export function exportExpensesToCsv(
  expenses: Expense[],
  members: TripMember[],
  categories: ExpenseCategory[],
  defaultCurrency: string,
  languageCode: string
): string {
  const headers = [
    "ID",
    "Descrição",
    "Valor",
    "Moeda",
    "Categoria",
    "Data",
    "Criado Por",
    "Visibilidade",
    "Confirmado",
  ];

  const csvRows = [headers.join(",")];

  for (const expense of expenses) {
    const createdByMember = members.find((m) => m.id === expense.created_by_member_id);
    const category = categories.find((c) => c.id === expense.category_id);

    const row = [
      `"${expense.id}"`,
      `"${expense.description.replace(/"/g, '""')}"`,
      formatCurrency(expense.amount, expense.currency || defaultCurrency, languageCode, false).replace(/,/g, "."), // Format currency and replace comma with dot for CSV compatibility
      `"${expense.currency || defaultCurrency}"`,
      `"${category?.name || ""}"`,
      `"${expense.date}"`,
      `"${createdByMember?.display_name || ""}"`,
      `"${expense.visibility}"`,
      `"${expense.is_confirmed ? "Sim" : "Não"}"`,
    ];
    csvRows.push(row.join(","));
  }

  return csvRows.join("\n");
}
