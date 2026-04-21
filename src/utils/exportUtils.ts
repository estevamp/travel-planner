import type { ExpenseCategory, TripMember, ExpenseWithSplits } from "../types";

export function exportExpensesToCsv(
  expenses: ExpenseWithSplits[],
  members: TripMember[],
  categories: ExpenseCategory[],
  defaultCurrency: string,
  languageCode: string,
  convert: (amount: number, fromCurrency: string) => number
): string {
  const memberHeaders = members.map((m) => `Rateio (${m.display_name || ""})`);

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
    ...memberHeaders,
  ];

  const csvRows = [headers.join(",")];

  for (const expense of expenses) {
    const createdByMember = members.find((m) => m.id === expense.created_by_member_id);
    const category = categories.find((c) => c.id === expense.category_id);
    const convertedAmount = convert(expense.amount, expense.currency || defaultCurrency);

    const memberSplitAmounts = members.map(member => {
      const split = expense.splits?.find(s => s.member_id === member.id);
      const splitAmountInDefaultCurrency = split ? convert(split.amount, expense.currency || defaultCurrency) : 0;
      return `"${splitAmountInDefaultCurrency.toFixed(2)}"`;
    });
    const row = [
      `"${expense.id}"`,
      `"${expense.description.replace(/"/g, '""')}"`,
      `"${expense.amount.toFixed(2)}"`,
      `"${expense.currency || defaultCurrency}"`,
      `"${convertedAmount.toFixed(2)}"`,
      `"${category?.name || ""}"`,
      `"${expense.date}"`,
      `"${createdByMember?.display_name || ""}"`,
      `"${expense.visibility}"`,
      `"${expense.is_confirmed ? "Sim" : "Não"}"`,
      ...memberSplitAmounts,
    ];
    csvRows.push(row.join(","));
  }

  return "\ufeff" + csvRows.join("\n");
}
