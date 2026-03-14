import {
  ExpenseWithSplits,
  Settlement,
  MemberBalance,
  SimplifiedTransfer,
  CreateExpenseSplitInput,
} from "../types/splitting";
import { TripMember } from "../types";

/**
 * Calculate equal splits for an expense, handling rounding
 * The difference (if any) is added to the first participant
 */
export function calculateEqualSplits(
  totalAmount: number,
  participantIds: string[]
): CreateExpenseSplitInput[] {
  if (participantIds.length === 0) {
    throw new Error("At least one participant is required");
  }

  const baseAmount = Math.floor((totalAmount * 100) / participantIds.length) / 100;
  const splits: CreateExpenseSplitInput[] = participantIds.map((member_id) => ({
    member_id,
    amount: baseAmount,
  }));

  // Calculate the difference due to rounding
  const totalSplits = baseAmount * participantIds.length;
  const difference = Math.round((totalAmount - totalSplits) * 100) / 100;

  // Add the difference to the first participant
  if (difference !== 0 && splits.length > 0) {
    splits[0].amount = Math.round((splits[0].amount! + difference) * 100) / 100;
  }

  return splits;
}

/**
 * Validate that unequal splits sum to the total amount
 */
export function validateUnequalSplits(
  totalAmount: number,
  splits: CreateExpenseSplitInput[]
): { isValid: boolean; difference: number } {
  const totalSplits = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  const difference = Math.round((totalAmount - totalSplits) * 100) / 100;

  return {
    isValid: Math.abs(difference) < 0.01, // Allow 1 cent tolerance
    difference,
  };
}

/**
 * Calculate net balances for all members in a trip
 * Positive balance = member is owed money
 * Negative balance = member owes money
 *
 * @param expenses - List of expenses with splits
 * @param settlements - List of settlements
 * @param members - List of trip members
 * @param targetCurrency - Currency to convert all amounts to
 * @param exchangeRates - Exchange rates relative to target currency
 */
export function calculateNetBalances(
  expenses: ExpenseWithSplits[],
  settlements: Settlement[],
  members: TripMember[],
  targetCurrency?: string,
  exchangeRates?: Record<string, number>
): MemberBalance[] {
  const balances: Record<string, number> = {};

  // Initialize all members with 0 balance
  members.forEach((member) => {
    balances[member.id] = 0;
  });

  // Helper function to convert amount to target currency
  const convertAmount = (amount: number, fromCurrency: string): number => {
    if (!targetCurrency || !exchangeRates || fromCurrency === targetCurrency) {
      return amount;
    }
    const rate = exchangeRates[fromCurrency];
    if (!rate) {
      console.warn(`No exchange rate found for ${fromCurrency}, using original amount`);
      return amount;
    }
    return amount / rate;
  };

  // Process confirmed expenses only
  expenses.forEach((expense) => {
    if (!expense.is_confirmed) return;

    // Skip expenses with no splits or only the payer in splits
    if (!expense.splits || expense.splits.length === 0) return;

    // Check if only the payer is in the splits
    const onlyPayerInSplits =
      expense.splits.length === 1 &&
      expense.splits[0].member_id === expense.paid_by_member_id;
    if (onlyPayerInSplits) return;

    const expenseCurrency = expense.currency || targetCurrency || "BRL";

    // Add to payer's credit (they paid the full amount) - converted to target currency
    const convertedExpenseAmount = convertAmount(expense.amount, expenseCurrency);
    balances[expense.paid_by_member_id] =
      (balances[expense.paid_by_member_id] || 0) + convertedExpenseAmount;

    // Subtract from each participant's debt (what they owe) - converted to target currency
    expense.splits.forEach((split) => {
      const convertedSplitAmount = convertAmount(split.amount, expenseCurrency);
      balances[split.member_id] = (balances[split.member_id] || 0) - convertedSplitAmount;
    });
  });

  // Adjust for settlements already made
  settlements.forEach((settlement) => {
    if (!settlement.is_confirmed) return;

    const settlementCurrency = settlement.currency || targetCurrency || "BRL";
    const convertedSettlementAmount = convertAmount(settlement.amount, settlementCurrency);

    // Debtor paid, so their balance increases (they owe less)
    balances[settlement.from_member_id] =
      (balances[settlement.from_member_id] || 0) + convertedSettlementAmount;

    // Creditor received, so their balance decreases (they are owed less)
    balances[settlement.to_member_id] =
      (balances[settlement.to_member_id] || 0) - convertedSettlementAmount;
  });

  // Convert to array with member names
  return Object.entries(balances)
    .map(([member_id, net_balance]) => {
      const member = members.find((m) => m.id === member_id);
      return {
        member_id,
        member_name: member?.display_name || "Unknown",
        net_balance: Math.round(net_balance * 100) / 100, // Round to 2 decimals
      };
    })
    .map((balance) => ({
      ...balance,
      net_balance: Math.abs(balance.net_balance) < 0.01 ? 0 : balance.net_balance,
    }))
    .filter((balance) => Math.abs(balance.net_balance) > 0.01); // Filter out zero balances for display
}

/**
 * Simplify debts using the greedy algorithm
 * Returns the minimum number of transfers needed to settle all debts
 */
export function simplifyDebts(
  balances: MemberBalance[],
  currency: string
): SimplifiedTransfer[] {
  // Separate creditors (positive balance) and debtors (negative balance)
  const creditors = balances
    .filter((b) => b.net_balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net_balance - a.net_balance); // Sort descending

  const debtors = balances
    .filter((b) => b.net_balance < -0.01)
    .map((b) => ({ ...b, net_balance: Math.abs(b.net_balance) }))
    .sort((a, b) => b.net_balance - a.net_balance); // Sort descending

  const transfers: SimplifiedTransfer[] = [];

  let i = 0; // Creditor index
  let j = 0; // Debtor index

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];

    // Transfer the minimum of what creditor is owed and what debtor owes
    const transferAmount = Math.min(creditor.net_balance, debtor.net_balance);

    transfers.push({
      from_member_id: debtor.member_id,
      from_member_name: debtor.member_name,
      to_member_id: creditor.member_id,
      to_member_name: creditor.member_name,
      amount: Math.round(transferAmount * 100) / 100,
      currency,
      is_completed: false,
    });

    // Update balances
    creditor.net_balance -= transferAmount;
    debtor.net_balance -= transferAmount;

    // Move to next creditor/debtor if balance is settled
    if (creditor.net_balance < 0.01) i++;
    if (debtor.net_balance < 0.01) j++;
  }

  return transfers;
}

/**
 * Compute bilateral (pair-wise) transfers WITHOUT global debt optimization.
 *
 * For each pair (A, B): debts in both directions are netted against each other,
 * but NO consolidation happens across three or more members.
 * This preserves the original "who owes whom" relationship from the splits.
 *
 * Example:
 *   A→B raw 10, B→A raw 20  → bilateral net: B paga A 10
 *   C→A raw 30              → C paga A 30
 *   B→C raw 10              → B paga C 10
 *
 * Already-confirmed settlements are discounted before netting.
 */
export function computeBilateralTransfers(
  expenses: ExpenseWithSplits[],
  settlements: Settlement[],
  members: TripMember[],
  targetCurrency: string,
  exchangeRates?: Record<string, number>
): SimplifiedTransfer[] {
  const convertAmount = (amount: number, fromCurrency: string): number => {
    if (!exchangeRates || fromCurrency === targetCurrency) return amount;
    const rate = exchangeRates[fromCurrency];
    return rate ? amount / rate : amount;
  };

  // rawDebt[fromId][toId] = total gross amount fromId owes toId
  const rawDebt: Record<string, Record<string, number>> = {};

  const addDebt = (fromId: string, toId: string, amount: number) => {
    if (fromId === toId || amount <= 0) return;
    if (!rawDebt[fromId]) rawDebt[fromId] = {};
    rawDebt[fromId][toId] = (rawDebt[fromId][toId] || 0) + amount;
  };

  // Build gross debts from confirmed expense splits
  for (const expense of expenses) {
    if (!expense.is_confirmed) continue;
    if (!expense.paid_by_member_id || !expense.splits?.length) continue;

    const payerId = expense.paid_by_member_id;
    const currency = expense.currency || targetCurrency;

    for (const split of expense.splits) {
      if (split.member_id === payerId) continue;
      addDebt(
        split.member_id,
        payerId,
        convertAmount(Number(split.amount) || 0, currency)
      );
    }
  }

  // Discount already-confirmed settlements from raw debts
  for (const settlement of settlements) {
    if (!settlement.is_confirmed) continue;
    const { from_member_id: f, to_member_id: t } = settlement;
    const paid = convertAmount(
      Number(settlement.amount) || 0,
      settlement.currency || targetCurrency
    );
    if (rawDebt[f]?.[t] !== undefined) {
      rawDebt[f][t] = Math.max(0, rawDebt[f][t] - paid);
    }
  }

  // For every pair (A, B): net both directions → at most one transfer per pair
  const memberIds = members.map((m) => m.id);
  const transfers: SimplifiedTransfer[] = [];

  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const A = memberIds[i];
      const B = memberIds[j];
      const aOwesB = rawDebt[A]?.[B] || 0;
      const bOwesA = rawDebt[B]?.[A] || 0;
      const net = aOwesB - bOwesA;

      if (Math.abs(net) < 0.01) continue;

      const fromId = net > 0 ? A : B;
      const toId = net > 0 ? B : A;
      const fromMember = members.find((m) => m.id === fromId);
      const toMember = members.find((m) => m.id === toId);

      transfers.push({
        from_member_id: fromId,
        from_member_name: fromMember?.display_name ?? "?",
        to_member_id: toId,
        to_member_name: toMember?.display_name ?? "?",
        amount: Math.round(Math.abs(net) * 100) / 100,
        currency: targetCurrency,
        is_completed: false,
      });
    }
  }

  return transfers;
}

/**
 * Get balance between current user and another member
 * Positive = other member owes current user
 * Negative = current user owes other member
 */
export function getBalanceBetweenMembers(
  currentUserId: string,
  otherMemberId: string,
  expenses: ExpenseWithSplits[],
  settlements: Settlement[]
): number {
  let balance = 0;

  // Process confirmed expenses
  expenses.forEach((expense) => {
    if (!expense.is_confirmed) return;

    // Skip expenses with no splits or only the payer in splits
    if (!expense.splits || expense.splits.length === 0) return;

    const onlyPayerInSplits =
      expense.splits.length === 1 &&
      expense.splits[0].member_id === expense.paid_by_member_id;
    if (onlyPayerInSplits) return;

    // If current user paid
    if (expense.paid_by_member_id === currentUserId) {
      const otherMemberSplit = expense.splits.find(
        (s) => s.member_id === otherMemberId
      );
      if (otherMemberSplit) {
        balance += otherMemberSplit.amount; // Other member owes current user
      }
    }

    // If other member paid
    if (expense.paid_by_member_id === otherMemberId) {
      const currentUserSplit = expense.splits.find(
        (s) => s.member_id === currentUserId
      );
      if (currentUserSplit) {
        balance -= currentUserSplit.amount; // Current user owes other member
      }
    }
  });

  // Adjust for settlements
  settlements.forEach((settlement) => {
    if (!settlement.is_confirmed) return;

    // Current user paid other member
    if (
      settlement.from_member_id === currentUserId &&
      settlement.to_member_id === otherMemberId
    ) {
      balance += settlement.amount;
    }

    // Other member paid current user
    if (
      settlement.from_member_id === otherMemberId &&
      settlement.to_member_id === currentUserId
    ) {
      balance -= settlement.amount;
    }
  });

  return Math.round(balance * 100) / 100;
}

/**
 * Check if a member can be removed from the trip
 * Returns true if member has no outstanding balance
 */
export function canRemoveMember(
  memberId: string,
  balances: MemberBalance[]
): { canRemove: boolean; reason?: string } {
  const memberBalance = balances.find((b) => b.member_id === memberId);

  if (!memberBalance || Math.abs(memberBalance.net_balance) < 0.01) {
    return { canRemove: true };
  }

  const owesOrOwed =
    memberBalance.net_balance > 0
      ? `is owed ${Math.abs(memberBalance.net_balance).toFixed(2)}`
      : `owes ${Math.abs(memberBalance.net_balance).toFixed(2)}`;

  return {
    canRemove: false,
    reason: `This member ${owesOrOwed}. Please settle all debts before removing.`,
  };
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(amount);
}