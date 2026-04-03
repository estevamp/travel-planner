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

  const totalSplits = baseAmount * participantIds.length;
  const difference = Math.round((totalAmount - totalSplits) * 100) / 100;

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
    isValid: Math.abs(difference) < 0.01,
    difference,
  };
}

/**
 * Calculate net balances for all members in a trip
 * Positive balance = member is owed money
 * Negative balance = member owes money
 */
export function calculateNetBalances(
  expenses: ExpenseWithSplits[],
  settlements: Settlement[],
  members: TripMember[],
  targetCurrency?: string,
  exchangeRates?: Record<string, number>
): MemberBalance[] {
  const balances: Record<string, number> = {};

  members.forEach((member) => {
    balances[member.id] = 0;
  });

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

  expenses.forEach((expense) => {
    if (!expense.is_confirmed) return;
    if (!expense.splits || expense.splits.length === 0) return;

    const onlyPayerInSplits =
      expense.splits.length === 1 &&
      expense.splits[0].member_id === expense.paid_by_member_id;
    if (onlyPayerInSplits) return;

    const expenseCurrency = expense.currency || targetCurrency || "BRL";
    const convertedExpenseAmount = convertAmount(expense.amount, expenseCurrency);
    balances[expense.paid_by_member_id] =
      (balances[expense.paid_by_member_id] || 0) + convertedExpenseAmount;

    expense.splits.forEach((split) => {
      const convertedSplitAmount = convertAmount(split.amount, expenseCurrency);
      balances[split.member_id] = (balances[split.member_id] || 0) - convertedSplitAmount;
    });
  });

  settlements.forEach((settlement) => {
    if (!settlement.is_confirmed) return;

    const settlementCurrency = settlement.currency || targetCurrency || "BRL";
    const convertedSettlementAmount = convertAmount(settlement.amount, settlementCurrency);

    balances[settlement.from_member_id] =
      (balances[settlement.from_member_id] || 0) + convertedSettlementAmount;
    balances[settlement.to_member_id] =
      (balances[settlement.to_member_id] || 0) - convertedSettlementAmount;
  });

  return Object.entries(balances)
    .map(([member_id, net_balance]) => {
      const member = members.find((m) => m.id === member_id);
      return {
        member_id,
        member_name: member?.display_name || "Unknown",
        net_balance: Math.round(net_balance * 100) / 100,
      };
    })
    .map((balance) => ({
      ...balance,
      net_balance: Math.abs(balance.net_balance) < 0.01 ? 0 : balance.net_balance,
    }))
    .filter((balance) => Math.abs(balance.net_balance) > 0.01);
}

/**
 * Simplify debts using the greedy algorithm
 * Returns the minimum number of transfers needed to settle all debts
 */
export function simplifyDebts(
  balances: MemberBalance[],
  currency: string
): SimplifiedTransfer[] {
  const creditors = balances
    .filter((b) => b.net_balance > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net_balance - a.net_balance);

  const debtors = balances
    .filter((b) => b.net_balance < -0.01)
    .map((b) => ({ ...b, net_balance: Math.abs(b.net_balance) }))
    .sort((a, b) => b.net_balance - a.net_balance);

  const transfers: SimplifiedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
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

    creditor.net_balance -= transferAmount;
    debtor.net_balance -= transferAmount;

    if (creditor.net_balance < 0.01) i++;
    if (debtor.net_balance < 0.01) j++;
  }

  return transfers;
}

/**
 * Compute bilateral (pair-wise) transfers WITHOUT global debt optimization.
 *
 * For each pair (A, B): debts in both directions are netted, but no
 * consolidation happens across three or more members.
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

  const rawDebt: Record<string, Record<string, number>> = {};

  const addDebt = (fromId: string, toId: string, amount: number) => {
    if (fromId === toId || amount <= 0) return;
    if (!rawDebt[fromId]) rawDebt[fromId] = {};
    rawDebt[fromId][toId] = (rawDebt[fromId][toId] || 0) + amount;
  };

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

  for (const settlement of settlements) {
    if (!settlement.is_confirmed) continue;
    const { from_member_id: f, to_member_id: t } = settlement;
    const paid = convertAmount(
      Number(settlement.amount) || 0,
      settlement.currency || targetCurrency
    );
    // Model settlements as flow in the opposite direction so pairwise netting
    // still works even when a payment exceeds the current debt.
    addDebt(t, f, paid);
  }

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
 * A transfer that may represent a couple (two spouses) as a single unit.
 * - `from_member_ids` has 1 item for a single payer, 2 for a couple.
 * - `to_member_ids` has 1 item for a single receiver, 2 for a couple.
 */
export interface GroupedTransfer {
  from_member_ids: string[];
  to_member_ids: string[];
  from_display_name: string; // e.g. "Ana/Bruno" for a couple, "Carlos" for a single
  to_display_name: string;
  amount: number;
  currency: string;
}

/**
 * Re-aggregate bilateral transfers so that spouse-pairs act as one unit.
 *
 * Algorithm:
 *  1. Build groups: each member belongs to a solo group or a couple group.
 *  2. For every pair of distinct groups (G1, G2): sum all bilateral flows in
 *     both directions and emit the net result as a single GroupedTransfer.
 *
 * Example:
 *  A married to B.
 *  Bilateral transfers: [B→C 100, A→C 40]   (A already netted C→A 10)
 *  Groups: {A,B} vs {C}
 *  Flow {A,B}→{C} = 100 + 40 = 140  →  "A/B devem 140 para C" ✓
 */
export function mergeSpouseTransfers(
  transfers: SimplifiedTransfer[],
  members: TripMember[],
  currency: string
): GroupedTransfer[] {
  // ── 1. Build groups ──────────────────────────────────────────────────────
  const groupKey = new Map<string, string>();   // memberId → canonical group id
  const groupMembers = new Map<string, TripMember[]>(); // groupId → members[]
  const visited = new Set<string>();

  for (const m of members) {
    if (visited.has(m.id)) continue;

    const spouse = m.spouse_member_id
      ? members.find((x) => x.id === m.spouse_member_id)
      : null;

    const key = m.id; // use this member's id as the canonical group key

    if (spouse && !visited.has(spouse.id)) {
      groupKey.set(m.id, key);
      groupKey.set(spouse.id, key);
      groupMembers.set(key, [m, spouse]);
      visited.add(m.id);
      visited.add(spouse.id);
    } else {
      groupKey.set(m.id, key);
      groupMembers.set(key, [m]);
      visited.add(m.id);
    }
  }

  // ── 2. Accumulate flows between groups ──────────────────────────────────
  const flow: Record<string, Record<string, number>> = {};

  const addFlow = (from: string, to: string, amount: number) => {
    if (!flow[from]) flow[from] = {};
    flow[from][to] = (flow[from][to] || 0) + amount;
  };

  for (const t of transfers) {
    const gFrom = groupKey.get(t.from_member_id);
    const gTo = groupKey.get(t.to_member_id);
    if (!gFrom || !gTo || gFrom === gTo) continue; // skip intra-couple edge cases
    addFlow(gFrom, gTo, t.amount);
  }

  // ── 3. Net each group pair and emit ─────────────────────────────────────
  const allGroupKeys = Array.from(groupMembers.keys());
  const result: GroupedTransfer[] = [];

  for (let i = 0; i < allGroupKeys.length; i++) {
    for (let j = i + 1; j < allGroupKeys.length; j++) {
      const g1 = allGroupKeys[i];
      const g2 = allGroupKeys[j];

      const g1toG2 = flow[g1]?.[g2] || 0;
      const g2toG1 = flow[g2]?.[g1] || 0;
      const net = g1toG2 - g2toG1;

      if (Math.abs(net) < 0.01) continue;

      const fromKey = net > 0 ? g1 : g2;
      const toKey = net > 0 ? g2 : g1;
      const fromMs = groupMembers.get(fromKey) ?? [];
      const toMs = groupMembers.get(toKey) ?? [];

      result.push({
        from_member_ids: fromMs.map((m) => m.id),
        to_member_ids: toMs.map((m) => m.id),
        from_display_name: fromMs.map((m) => m.display_name ?? "?").join("/"),
        to_display_name: toMs.map((m) => m.display_name ?? "?").join("/"),
        amount: Math.round(Math.abs(net) * 100) / 100,
        currency,
      });
    }
  }

  return result;
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

  expenses.forEach((expense) => {
    if (!expense.is_confirmed) return;
    if (!expense.splits || expense.splits.length === 0) return;

    const onlyPayerInSplits =
      expense.splits.length === 1 &&
      expense.splits[0].member_id === expense.paid_by_member_id;
    if (onlyPayerInSplits) return;

    if (expense.paid_by_member_id === currentUserId) {
      const otherMemberSplit = expense.splits.find((s) => s.member_id === otherMemberId);
      if (otherMemberSplit) balance += otherMemberSplit.amount;
    }

    if (expense.paid_by_member_id === otherMemberId) {
      const currentUserSplit = expense.splits.find((s) => s.member_id === currentUserId);
      if (currentUserSplit) balance -= currentUserSplit.amount;
    }
  });

  settlements.forEach((settlement) => {
    if (!settlement.is_confirmed) return;

    if (
      settlement.from_member_id === currentUserId &&
      settlement.to_member_id === otherMemberId
    ) {
      balance += settlement.amount;
    }

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
