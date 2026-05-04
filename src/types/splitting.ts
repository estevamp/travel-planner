import type { Expense, SplitType } from "./index";

/**
 * Represents how an expense is split among participants
 */
export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string; // The person who owes this portion
  amount: number;    // The amount this person owes
  percentage?: number; // Optional: for unequal split by percentage
  created_at: string;
}

/**
 * Extended expense with splitting information
 */
export interface ExpenseWithSplits extends Expense {
  paid_by_member_id: string; // Who actually paid the bill
  split_type: SplitType;
  splits: ExpenseSplit[];
}

/**
 * Represents a payment made between members to settle debts
 */
export interface Settlement {
  id: string;
  trip_id: string;
  from_member_id: string; // Debtor
  to_member_id: string;   // Creditor
  amount: number;
  currency: string;
  date: string;
  is_confirmed: boolean;
  created_at: string;
}

/**
 * Tracks the overall settlement status of a trip
 */
export interface TripSettlementStatus {
  id: string;
  trip_id: string;
  is_settled: boolean;
  settled_at?: string;
  created_at: string;
}

/**
 * Represents the net balance for a member
 */
export interface MemberBalance {
  member_id: string;
  member_name: string;
  net_balance: number; // Positive = they are owed, Negative = they owe
}

/**
 * Represents a simplified transfer needed to settle all debts
 */
export interface SimplifiedTransfer {
  from_member_id: string;
  from_member_name: string;
  to_member_id: string;
  to_member_name: string;
  amount: number;
  currency: string;
  is_completed: boolean;
}

/**
 * Input for creating a new expense split
 */
export interface CreateExpenseSplitInput {
  member_id: string;
  amount?: number;
  percentage?: number;
}

/**
 * Input for creating a new expense with splits
 */
export interface CreateExpenseWithSplitsInput {
  trip_id: string;
  description: string;
  amount: number;
  currency: string;
  category_id?: string;
  date: string;
  visibility: "public" | "private";
  is_confirmed: boolean;
  paid_by_member_id: string;
  split_type: SplitType;
  splits: CreateExpenseSplitInput[];
}
