import type { ExpenseCategory, TripMember, ExpenseWithSplits, Settlement } from "../types";

export function exportExpensesToCsv(
  expenses: ExpenseWithSplits[],
  settlements: Settlement[],
  members: TripMember[],
  categories: ExpenseCategory[],
  defaultCurrency: string,
  languageCode: string,
  convert: (amount: number, fromCurrency: string) => number
): string {
  const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const toTime = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  const memberHeaders = members.map((m) => `Rateio (${m.display_name || ""})`);

  const headers = [
    "Data",
    "Descrição",
    "Valor",
    "Moeda",
    "Valor na Moeda Principal",
    "Categoria",
    "Pago por",
    "Recebido por",
    "Criado Por",
    "Visibilidade",
    "Confirmado",
    "Acerto",
    ...memberHeaders,
  ];

  const csvRows = [headers.join(",")];
  const reportRows: Array<{ date: string; order: number; row: string[] }> = [];

  for (const expense of expenses) {
    const createdByMember = members.find((m) => m.id === expense.created_by_member_id);
    const paidByMember = members.find((m) => m.id === expense.paid_by_member_id);
    const category = categories.find((c) => c.id === expense.category_id);
    const convertedAmount = convert(expense.amount, expense.currency || defaultCurrency);
    const reportDate = expense.payment_date || expense.date;

    const memberSplitAmounts = members.map(member => {
      const split = expense.splits?.find(s => s.member_id === member.id);
      const splitAmountInDefaultCurrency = split ? convert(split.amount, expense.currency || defaultCurrency) : 0;
      return csvCell(splitAmountInDefaultCurrency.toFixed(2));
    });
    const row = [
      csvCell(reportDate),
      csvCell(expense.description),
      csvCell(paidByMember?.display_name || ""),
      csvCell(expense.amount.toFixed(2)),
      csvCell(expense.currency || defaultCurrency),
      csvCell(convertedAmount.toFixed(2)),
      csvCell(category?.name || ""),
      csvCell(""),
      csvCell(createdByMember?.display_name || ""),
      csvCell(expense.visibility),
      csvCell(expense.is_confirmed ? "Sim" : "Não"),
      ...memberSplitAmounts,
    ];
    reportRows.push({ date: reportDate, order: 0, row });
  }

  for (const settlement of settlements) {
    const payer = members.find((m) => m.id === settlement.from_member_id);
    const receiver = members.find((m) => m.id === settlement.to_member_id);
    const currency = settlement.currency || defaultCurrency;
    const convertedAmount = convert(settlement.amount, currency);
    const reportDate = settlement.date;
    const emptyMemberSplits = members.map(() => csvCell(""));

    const row = [
      csvCell(reportDate),
      csvCell(`${payer?.display_name || ""} pagou ${receiver?.display_name || ""}`.trim()),
      csvCell(payer?.display_name || ""),
      csvCell(settlement.amount.toFixed(2)),
      csvCell(currency),
      csvCell(convertedAmount.toFixed(2)),
      csvCell(""),
      csvCell(receiver?.display_name || ""),
      csvCell(""),
      csvCell(""),
      csvCell(settlement.is_confirmed ? "Sim" : "Não"),
      ...emptyMemberSplits,
    ];
    reportRows.push({ date: reportDate, order: 1, row });
  }

  reportRows
    .sort((a, b) => toTime(a.date) - toTime(b.date) || a.order - b.order)
    .forEach(({ row }) => csvRows.push(row.join(",")));

  return "\ufeff" + csvRows.join("\n");
}

export function exportPaymentsToCsv(
  settlements: Settlement[],
  members: TripMember[],
  defaultCurrency: string,
  convert: (amount: number, fromCurrency: string) => number
): string {
  const headers = [
    "ID",
    "Quem Pagou",
    "Quem Recebeu",
    "Valor",
    "Moeda",
    "Data",
    "Confirmado",
  ];

  const csvRows = [headers.join(",")];

  for (const settlement of settlements) {
    const payer = members.find((m) => m.id === settlement.from_member_id);
    const receiver = members.find((m) => m.id === settlement.to_member_id);
    const convertedAmount = convert(settlement.amount, settlement.currency || defaultCurrency);

    const row = [
      `"${settlement.id}"`,
      `"${(payer?.display_name || "").replace(/"/g, '""')}"`,
      `"${(receiver?.display_name || "").replace(/"/g, '""')}"`,
      `"${convertedAmount.toFixed(2)}"`,
      `"${defaultCurrency}"`,
      `"${settlement.date}"`,
      `"${settlement.is_confirmed ? "Sim" : "Não"}"`,
    ];
    csvRows.push(row.join(","));
  }

  return "\ufeff" + csvRows.join("\n");
}
