import type { Expense, ExpenseCategory, TripMember } from "../types";
import { formatCurrency } from "./index";

export function exportExpensesToCsv(
  expenses: Expense[],
  members: TripMember[],
  categories: ExpenseCategory[],
  defaultCurrency: string,
  languageCode: string,
  convert: (amount: number, fromCurrency: string) => number
): string {
  const headers = [
    "ID",
    "Descrição",
    "Valor",
    "Moeda",
    "Valor na Moeda Principal",
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
    const convertedAmount = convert(expense.amount, expense.currency || defaultCurrency);

    const row = [
      `"${expense.id}"`,
      `"${expense.description.replace(/"/g, '""')}"`,
      formatCurrency(expense.amount, expense.currency || defaultCurrency, languageCode, false).replace(/,/g, "."),
      `"${expense.currency || defaultCurrency}"`,
      convertedAmount.toFixed(2).replace(/,/g, "."),
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
