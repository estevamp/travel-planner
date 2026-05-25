import type { ExpenseCategory, TripMember, ExpenseWithSplits, Settlement, ItineraryItem, ItineraryType } from "../types";
import jsPDF from "jspdf";

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
  const formatCsvDate = (value: string) => {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const memberHeaders = members.map((m) => `Rateio (${m.display_name || ""})`);

  const headers = [
    "Data",
    "Descrição",
    "Pago por",
    "Recebido por",
    "Moeda",
    "Valor",
    "Valor na Moeda Principal",
    "Categoria",
    "Visibilidade",
    "Confirmado",
    ...memberHeaders,
  ];

  const csvRows = [headers.join(",")];
  const reportRows: Array<{ date: string; order: number; row: string[] }> = [];

  for (const expense of expenses) {
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
      csvCell(formatCsvDate(reportDate)),
      csvCell(expense.description),
      csvCell(paidByMember?.display_name || ""),
      csvCell(""),
      csvCell(expense.currency || defaultCurrency),
      csvCell(expense.amount.toFixed(2)),
      csvCell(convertedAmount.toFixed(2)),
      csvCell(category?.name || ""),
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
    const convertedAmount = convert(settlement.amount * -1, currency);
    const reportDate = settlement.date;
    const emptyMemberSplits = members.map(() => csvCell(""));

    const row = [
      csvCell(formatCsvDate(reportDate)),
      csvCell(`${payer?.display_name || ""} pagou ${receiver?.display_name || ""}`.trim()),
      csvCell(payer?.display_name || ""),
      csvCell(receiver?.display_name || ""),
      csvCell(currency),
      csvCell((settlement.amount * -1).toFixed(2)),
      csvCell(convertedAmount.toFixed(2)),
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

export function exportItineraryToPdf(
  tripName: string,
  destination: string,
  startDate: string,
  endDate: string,
  items: ItineraryItem[],
  types: ItineraryType[],
  members: TripMember[],
  languageCode: string,
  defaultCurrency: string
): void {
  const doc = new jsPDF();
  
  const formatDateTime = (dateTimeStr: string | null, isAllDay?: boolean): string => {
    if (!dateTimeStr) return "";
    if (isAllDay) {
      const datePart = dateTimeStr.slice(0, 10);
      try {
        const d = new Date(datePart + "T00:00:00");
        return d.toLocaleDateString(languageCode === "en" ? "en-US" : "pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      } catch {
        return datePart;
      }
    }
    try {
      const d = new Date(dateTimeStr);
      return d.toLocaleString(languageCode === "en" ? "en-US" : "pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateTimeStr;
    }
  };

  const getTypeName = (typeId: string | null): string => {
    if (!typeId) return "";
    const type = types.find((t) => t.id === typeId);
    return type?.name || "";
  };

  const getCreatorName = (memberId: string): string => {
    const member = members.find((m) => m.id === memberId);
    return member?.display_name || (languageCode === "en" ? "Unknown" : "Desconhecido");
  };

  const formatCurrencyAmount = (amount: number, currency: string): string => {
    return `${currency} ${amount.toFixed(2)}`;
  };

  // Group items by date
  const groupedByDate = items.reduce<Record<string, ItineraryItem[]>>((acc, item) => {
    const dateKey = item.start_time?.slice(0, 10) || "no-date";
    (acc[dateKey] ??= []).push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
    if (a === "no-date") return 1;
    if (b === "no-date") return -1;
    return a.localeCompare(b);
  });

  // Header
  doc.setFontSize(18);
  doc.text(tripName, 14, 20);
  
  doc.setFontSize(12);
  doc.text(destination, 14, 28);
  
  doc.setFontSize(10);
  const dateRange = `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`;
  doc.text(dateRange, 14, 35);

  let yPos = 45;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const contentWidth = doc.internal.pageSize.width - margin * 2;

  // Helper to check for page break
  const checkPageBreak = (neededHeight: number) => {
    if (yPos + neededHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
    }
  };

  // Render each date section
  sortedDates.forEach((dateKey) => {
    const dayItems = groupedByDate[dateKey];
    
    // Format date header
    let dateLabel: string;
    if (dateKey === "no-date") {
      dateLabel = languageCode === "en" ? "No date set" : "Sem data definida";
    } else {
      try {
        const d = new Date(dateKey + "T00:00:00");
        dateLabel = d.toLocaleDateString(languageCode === "en" ? "en-US" : "pt-BR", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      } catch {
        dateLabel = dateKey;
      }
    }

    checkPageBreak(20);
    
    // Date header with background
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(200, 200, 200);
    doc.rect(margin, yPos - 5, contentWidth, 8, "F");
    doc.setTextColor(0, 0, 0);
    doc.text(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1), margin + 2, yPos);
    yPos += 12;

    // Sort items by start time
    dayItems.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

    // Render each item
    dayItems.forEach((item) => {
      const itemStartY = yPos;
      
      // Title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      checkPageBreak(30);
      doc.text(item.title, margin + 2, yPos);
      yPos += 6;

      // Type
      const typeName = getTypeName(item.type_id);
      if (typeName) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(typeName, margin + 2, yPos);
        yPos += 5;
        doc.setTextColor(0, 0, 0);
      }

      // Time
      const startTime = formatDateTime(item.start_time, item.is_all_day);
      const endTime = formatDateTime(item.end_time, item.is_all_day);
      const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : startTime || endTime || "";
      
      if (timeRange) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(timeRange, margin + 2, yPos);
        yPos += 5;
      }

      // Location
      if (item.location) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`${languageCode === "en" ? "Location:" : "Local:"} ${item.location}`, margin + 2, yPos);
        yPos += 5;
      }

      // Description
      if (item.description) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const descriptionLines = doc.splitTextToSize(item.description, contentWidth - 4);
        descriptionLines.forEach((line: string) => {
          doc.text(line, margin + 2, yPos);
          yPos += 4;
        });
      }

      // URL
      if (item.url) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(0, 0, 255);
        doc.textWithLink(item.url, margin + 2, yPos, { url: item.url });
        yPos += 5;
        doc.setTextColor(0, 0, 0);
      }

      // Amount
      if (item.amount > 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`${languageCode === "en" ? "Cost:" : "Custo:"} ${formatCurrencyAmount(item.amount, item.currency)}`, margin + 2, yPos);
        yPos += 5;
      }

      // Created by
      const creatorName = getCreatorName(item.created_by_member_id);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`${creatorName}`, margin + 2, yPos);
      yPos += 2;

      // Status
      if (item.is_completed) {
        doc.setTextColor(16, 185, 129);
        doc.text(`✓ ${languageCode === "en" ? "Completed" : "Concluído"}`, margin + 2, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 2;
      }

      // Add spacing between items
      yPos += 8;

      // Draw separator line
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, itemStartY, margin + contentWidth, itemStartY);
    });

    yPos += 5;
  });

  // Save the PDF
  const fileName = `${tripName.replace(/\s/g, "_")}_itinerary.pdf`;
  doc.save(fileName);
}
