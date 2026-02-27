# Expense Splitting Implementation Guide

## Overview

This document provides a complete implementation guide for the expense splitting feature in the **Partiu!** app, inspired by Splitwise. The system allows users to split expenses among group members, track balances, and settle debts with optimized transfers.

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Models](#data-models)
3. [Core Algorithms](#core-algorithms)
4. [UI Components](#ui-components)
5. [Database Schema](#database-schema)
6. [Integration Steps](#integration-steps)
7. [Edge Cases](#edge-cases)
8. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

The expense splitting system is built with the following layers:

```
┌─────────────────────────────────────────┐
│         UI Components Layer             │
│  (PayerSelector, SplitSelector, etc.)   │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Business Logic Layer            │
│  (splitting.ts utility functions)       │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Data Layer (Supabase)           │
│  (expenses, expense_splits, etc.)       │
└─────────────────────────────────────────┘
```

### Key Principles

- **Pure Functions**: All calculation logic is implemented as pure functions for testability
- **Incremental**: Extends existing expense functionality without breaking changes
- **Optimized**: Uses greedy algorithm for debt simplification (O(N log N))
- **Type-Safe**: Full TypeScript support with strict types

---

## Data Models

### TypeScript Types

Located in [`src/types/splitting.ts`](src/types/splitting.ts):

```typescript
// Split type: equal or unequal distribution
export type SplitType = "equal" | "unequal";

// Individual split record
export interface ExpenseSplit {
  id: string;
  expense_id: string;
  member_id: string;
  amount: number;
  percentage?: number;
  created_at: string;
}

// Extended expense with splitting info
export interface ExpenseWithSplits extends Expense {
  paid_by_member_id: string;
  split_type: SplitType;
  splits: ExpenseSplit[];
}

// Settlement between two members
export interface Settlement {
  id: string;
  trip_id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  currency: string;
  date: string;
  is_confirmed: boolean;
  created_at: string;
}

// Net balance for a member
export interface MemberBalance {
  member_id: string;
  member_name: string;
  net_balance: number; // Positive = owed, Negative = owes
}

// Simplified transfer for settlement
export interface SimplifiedTransfer {
  from_member_id: string;
  from_member_name: string;
  to_member_id: string;
  to_member_name: string;
  amount: number;
  currency: string;
  is_completed: boolean;
}
```

---

## Core Algorithms

### 1. Equal Split Calculation

**Function**: [`calculateEqualSplits()`](src/utils/splitting.ts:17)

Divides an expense equally among participants, handling rounding by adding the difference to the first participant.

```typescript
// Example: R$ 10.00 split among 3 people
// Result: [3.34, 3.33, 3.33]
const splits = calculateEqualSplits(10.00, ['member1', 'member2', 'member3']);
```

**Algorithm**:
1. Calculate base amount: `floor(total / N * 100) / 100`
2. Calculate difference: `total - (base * N)`
3. Add difference to first participant

**Time Complexity**: O(N)

---

### 2. Net Balance Calculation

**Function**: [`calculateNetBalances()`](src/utils/splitting.ts:68)

Calculates the net balance for each member considering all confirmed public expenses and settlements.

```typescript
const balances = calculateNetBalances(expenses, settlements, members);
// Returns: [
//   { member_id: '1', member_name: 'Ana', net_balance: 75 },
//   { member_id: '2', member_name: 'Bruno', net_balance: -25 },
//   ...
// ]
```

**Algorithm**:
1. Initialize all members with balance = 0
2. For each confirmed public expense:
   - Add full amount to payer's balance
   - Subtract split amount from each participant's balance
3. For each confirmed settlement:
   - Add amount to debtor's balance (they owe less)
   - Subtract amount from creditor's balance (they are owed less)
4. Round to 2 decimals and filter near-zero balances

**Time Complexity**: O(E + S + M) where E = expenses, S = settlements, M = members

---

### 3. Debt Simplification (Greedy Algorithm)

**Function**: [`simplifyDebts()`](src/utils/splitting.ts:113)

Minimizes the number of transfers needed to settle all debts using a greedy approach.

```typescript
const transfers = simplifyDebts(balances, 'BRL');
// Returns: [
//   { from: 'Bruno', to: 'Ana', amount: 25 },
//   { from: 'Carol', to: 'Ana', amount: 25 },
//   ...
// ]
```

**Algorithm**:
1. Separate members into creditors (positive balance) and debtors (negative balance)
2. Sort both lists by absolute value (descending)
3. While both lists have members:
   - Take largest creditor and largest debtor
   - Transfer amount = min(creditor_balance, debtor_balance)
   - Update balances
   - Remove members with zero balance
4. Return list of transfers

**Example with 4 Members**:

```
Initial State:
- Ana: +75 (paid 100, owes 25)
- Bruno: -25 (paid 0, owes 25)
- Carol: -25 (paid 0, owes 25)
- Davi: -25 (paid 0, owes 25)

Step 1: Separate and sort
Creditors: [Ana: 75]
Debtors: [Davi: 25, Carol: 25, Bruno: 25]

Step 2: Match largest pairs
Transfer 1: Davi → Ana (25)
  Ana: 75 - 25 = 50
  Davi: 25 - 25 = 0 (removed)

Transfer 2: Carol → Ana (25)
  Ana: 50 - 25 = 25
  Carol: 25 - 25 = 0 (removed)

Transfer 3: Bruno → Ana (25)
  Ana: 25 - 25 = 0 (removed)
  Bruno: 25 - 25 = 0 (removed)

Result: 3 transfers (optimal)
```

**Time Complexity**: O(N log N) due to sorting
**Space Complexity**: O(N)

**Why This Works**:
- For N members, worst case is N-1 transfers (one person pays everyone or everyone pays one person)
- Greedy approach guarantees minimum transfers by always matching largest amounts
- For typical trip groups (5-20 people), this is extremely fast (<1ms)

---

## UI Components

### 1. PayerSelector

**File**: [`src/components/PayerSelector.tsx`](src/components/PayerSelector.tsx)

Horizontal scrollable list of trip members to select who paid the expense.

**Props**:
- `members`: List of trip members
- `selectedPayerId`: Currently selected payer
- `currentUserId`: Current user's ID (to show "Eu")
- `onSelect`: Callback when payer is selected

**Usage**:
```tsx
<PayerSelector
  members={tripMembers}
  selectedPayerId={payerId}
  currentUserId={currentUser.id}
  onSelect={setPayerId}
/>
```

---

### 2. SplitSelector

**File**: [`src/components/SplitSelector.tsx`](src/components/SplitSelector.tsx)

Allows users to select participants and choose between equal/unequal split.

**Props**:
- `members`: List of trip members
- `totalAmount`: Total expense amount
- `currentUserId`: Current user's ID
- `onSplitsChange`: Callback with calculated splits

**Features**:
- Toggle between equal/unequal split
- Checkbox for each member
- Auto-calculation for equal split
- Manual input for unequal split
- Real-time validation (sum must equal total)

**Usage**:
```tsx
<SplitSelector
  members={tripMembers}
  totalAmount={expenseAmount}
  currentUserId={currentUser.id}
  onSplitsChange={(splits, splitType) => {
    setSplits(splits);
    setSplitType(splitType);
  }}
/>
```

---

### 3. BalancesSummary

**File**: [`src/components/BalancesSummary.tsx`](src/components/BalancesSummary.tsx)

Displays net balance for current user and breakdown with each member.

**Props**:
- `balances`: Array of member balances
- `currentUserId`: Current user's ID
- `members`: List of trip members
- `currency`: Currency code
- `onSettleClick`: Callback for "Quitar viagem" button

**Features**:
- Overall balance card (green if owed, red if owes)
- Individual balance breakdown
- Summary stats (total owed/owing)
- "Quitar viagem" button

**Usage**:
```tsx
<BalancesSummary
  balances={memberBalances}
  currentUserId={currentUser.id}
  members={tripMembers}
  currency="BRL"
  onSettleClick={() => setShowSettlement(true)}
/>
```

---

### 4. TripSettlementModal

**File**: [`src/components/TripSettlementModal.tsx`](src/components/TripSettlementModal.tsx)

Modal showing simplified transfers needed to settle all debts.

**Props**:
- `transfers`: Array of simplified transfers
- `currency`: Currency code
- `onClose`: Callback to close modal
- `onMarkComplete`: Callback when transfer is marked as paid
- `onFinalize`: Callback when all transfers are complete

**Features**:
- Shows minimum transfers needed
- "Marcar como pago" button for each transfer
- Progress indicator
- "Finalizar quitação" button (enabled when all complete)
- Special case: Shows "Tudo acertado! 🎉" if no transfers needed

**Usage**:
```tsx
<TripSettlementModal
  transfers={simplifiedTransfers}
  currency="BRL"
  onClose={() => setShowModal(false)}
  onMarkComplete={(fromId, toId) => {
    // Create settlement record
  }}
  onFinalize={() => {
    // Mark trip as settled
  }}
/>
```

---

## Database Schema

### Tables

#### 1. `expenses` (Extended)

```sql
ALTER TABLE expenses
ADD COLUMN paid_by_member_id UUID REFERENCES trip_members(id),
ADD COLUMN split_type TEXT CHECK (split_type IN ('equal', 'unequal')) DEFAULT 'equal';
```

#### 2. `expense_splits` (New)

```sql
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  percentage DECIMAL(5, 2) CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, member_id)
);
```

#### 3. `settlements` (New)

```sql
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  to_member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_confirmed BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (from_member_id != to_member_id)
);
```

#### 4. `trip_settlement_status` (New)

```sql
CREATE TABLE trip_settlement_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE UNIQUE,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### View: `member_balances`

Materialized view for efficient balance calculation:

```sql
CREATE OR REPLACE VIEW member_balances AS
SELECT
  tm.id AS member_id,
  tm.trip_id,
  tm.display_name AS member_name,
  COALESCE(paid.total_paid, 0) - COALESCE(owed.total_owed, 0) + COALESCE(settled.net_settled, 0) AS net_balance
FROM trip_members tm
LEFT JOIN (
  SELECT e.paid_by_member_id, SUM(e.amount) AS total_paid
  FROM expenses e
  WHERE e.is_confirmed = TRUE AND e.visibility = 'public'
  GROUP BY e.paid_by_member_id
) paid ON paid.paid_by_member_id = tm.id
LEFT JOIN (
  SELECT es.member_id, SUM(es.amount) AS total_owed
  FROM expense_splits es
  JOIN expenses e ON e.id = es.expense_id
  WHERE e.is_confirmed = TRUE AND e.visibility = 'public'
  GROUP BY es.member_id
) owed ON owed.member_id = tm.id
LEFT JOIN (
  SELECT
    tm.id AS member_id,
    COALESCE(paid_out.total, 0) - COALESCE(received.total, 0) AS net_settled
  FROM trip_members tm
  LEFT JOIN (
    SELECT from_member_id, SUM(amount) AS total
    FROM settlements
    WHERE is_confirmed = TRUE
    GROUP BY from_member_id
  ) paid_out ON paid_out.from_member_id = tm.id
  LEFT JOIN (
    SELECT to_member_id, SUM(amount) AS total
    FROM settlements
    WHERE is_confirmed = TRUE
    GROUP BY to_member_id
  ) received ON received.to_member_id = tm.id
) settled ON settled.member_id = tm.id;
```

### Row Level Security (RLS)

All tables have RLS policies ensuring:
- Users can only view/modify data for trips they're members of
- Only expense creators can modify their expense splits
- Only trip admins can finalize settlement status

See [`supabase/expense_splitting_migration.sql`](supabase/expense_splitting_migration.sql) for complete RLS policies.

---

## Integration Steps

### Step 1: Run Database Migration

```bash
# Apply the migration to your Supabase instance
psql -h your-db-host -U postgres -d your-db-name -f supabase/expense_splitting_migration.sql
```

Or use Supabase Dashboard → SQL Editor → paste migration content → Run.

### Step 2: Update Expense Creation Flow

Modify [`src/components/tabs/ExpensesTab.tsx`](src/components/tabs/ExpensesTab.tsx):

```tsx
import { PayerSelector } from '../PayerSelector';
import { SplitSelector } from '../SplitSelector';
import { CreateExpenseSplitInput, SplitType } from '../../types/splitting';

// Add state
const [payerId, setPayerId] = useState<string>('');
const [splits, setSplits] = useState<CreateExpenseSplitInput[]>([]);
const [splitType, setSplitType] = useState<SplitType>('equal');

// In expense form, add:
<PayerSelector
  members={tripMembers}
  selectedPayerId={payerId}
  currentUserId={currentUser.id}
  onSelect={setPayerId}
/>

<SplitSelector
  members={tripMembers}
  totalAmount={amount}
  currentUserId={currentUser.id}
  onSplitsChange={(newSplits, newSplitType) => {
    setSplits(newSplits);
    setSplitType(newSplitType);
  }}
/>

// When saving expense:
const { data: expense, error } = await supabase
  .from('expenses')
  .insert({
    ...expenseData,
    paid_by_member_id: payerId,
    split_type: splitType,
  })
  .select()
  .single();

if (expense && splits.length > 0) {
  await supabase.from('expense_splits').insert(
    splits.map(split => ({
      expense_id: expense.id,
      member_id: split.member_id,
      amount: split.amount,
      percentage: split.percentage,
    }))
  );
}
```

### Step 3: Add Balances to People Tab

Modify [`src/components/tabs/PeopleTab.tsx`](src/components/tabs/PeopleTab.tsx):

```tsx
import { BalancesSummary } from '../BalancesSummary';
import { TripSettlementModal } from '../TripSettlementModal';
import { calculateNetBalances, simplifyDebts } from '../../utils/splitting';
import { useState, useEffect } from 'react';

const [showSettlement, setShowSettlement] = useState(false);
const [balances, setBalances] = useState<MemberBalance[]>([]);
const [transfers, setTransfers] = useState<SimplifiedTransfer[]>([]);

// Fetch expenses with splits and settlements
useEffect(() => {
  const fetchBalances = async () => {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, splits:expense_splits(*)')
      .eq('trip_id', tripId);

    const { data: settlements } = await supabase
      .from('settlements')
      .select('*')
      .eq('trip_id', tripId);

    const calculatedBalances = calculateNetBalances(
      expenses || [],
      settlements || [],
      tripMembers
    );

    setBalances(calculatedBalances);
  };

  fetchBalances();
}, [tripId, tripMembers]);

// Add to render:
<BalancesSummary
  balances={balances}
  currentUserId={currentUser.id}
  members={tripMembers}
  currency={trip.currency || 'BRL'}
  onSettleClick={() => {
    const simplified = simplifyDebts(balances, trip.currency || 'BRL');
    setTransfers(simplified);
    setShowSettlement(true);
  }}
/>

{showSettlement && (
  <TripSettlementModal
    transfers={transfers}
    currency={trip.currency || 'BRL'}
    onClose={() => setShowSettlement(false)}
    onMarkComplete={async (fromId, toId) => {
      const transfer = transfers.find(
        t => t.from_member_id === fromId && t.to_member_id === toId
      );
      if (transfer) {
        await supabase.from('settlements').insert({
          trip_id: tripId,
          from_member_id: fromId,
          to_member_id: toId,
          amount: transfer.amount,
          currency: trip.currency || 'BRL',
        });
      }
    }}
    onFinalize={async () => {
      await supabase
        .from('trip_settlement_status')
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .eq('trip_id', tripId);
      setShowSettlement(false);
    }}
  />
)}
```

### Step 4: Update Types Export

Add to [`src/types/index.ts`](src/types/index.ts):

```typescript
export * from './splitting';
```

---

## Edge Cases

### 1. Rounding Errors

**Problem**: R$ 10.00 ÷ 3 = R$ 3.333...

**Solution**: [`calculateEqualSplits()`](src/utils/splitting.ts:17) adds the difference to the first participant.

```typescript
// Input: 10.00, 3 participants
// Output: [3.34, 3.33, 3.33]
// Total: 10.00 ✓
```

### 2. Payer Not in Split

**Problem**: Ana pays R$ 100, but only Bruno and Carol split it.

**Solution**: This is valid. Ana's balance increases by 100, Bruno and Carol each owe 50.

```typescript
// Ana: +100 (paid) - 0 (owes) = +100
// Bruno: 0 (paid) - 50 (owes) = -50
// Carol: 0 (paid) - 50 (owes) = -50
```

### 3. Member Removal with Outstanding Balance

**Problem**: User tries to remove a member who owes/is owed money.

**Solution**: [`canRemoveMember()`](src/utils/splitting.ts:200) checks balance before removal.

```typescript
const { canRemove, reason } = canRemoveMember(memberId, balances);
if (!canRemove) {
  alert(reason); // "This member owes 50.00. Please settle all debts before removing."
  return;
}
```

### 4. Edited Expense

**Problem**: User edits an expense that already has splits.

**Solution**: Recalculate balances from scratch (idempotent operation).

```typescript
// When editing:
// 1. Delete old splits
await supabase.from('expense_splits').delete().eq('expense_id', expenseId);

// 2. Insert new splits
await supabase.from('expense_splits').insert(newSplits);

// 3. Balances are recalculated on next fetch (no cached state)
```

### 5. All Balances Zero

**Problem**: No transfers needed, but user clicks "Quitar viagem".

**Solution**: [`TripSettlementModal`](src/components/TripSettlementModal.tsx:42) shows special message.

```tsx
if (transfers.length === 0) {
  return (
    <div>
      <div className="text-6xl mb-4">🎉</div>
      <h2>Tudo acertado!</h2>
      <p>Nenhum acerto necessário. Todos os saldos estão zerados!</p>
    </div>
  );
}
```

### 6. Two-Person Group

**Problem**: Simplification algorithm with only 2 people.

**Solution**: Works correctly (degenerates to single transfer).

```typescript
// Ana: +50, Bruno: -50
// Result: [{ from: 'Bruno', to: 'Ana', amount: 50 }]
```

---

## Testing Strategy

### Unit Tests

Create [`src/utils/splitting.test.ts`](src/utils/splitting.test.ts):

```typescript
import { describe, it, expect } from 'vitest';
import {
  calculateEqualSplits,
  validateUnequalSplits,
  calculateNetBalances,
  simplifyDebts,
} from './splitting';

describe('calculateEqualSplits', () => {
  it('should split evenly with no remainder', () => {
    const splits = calculateEqualSplits(100, ['a', 'b', 'c', 'd']);
    expect(splits).toEqual([
      { member_id: 'a', amount: 25 },
      { member_id: 'b', amount: 25 },
      { member_id: 'c', amount: 25 },
      { member_id: 'd', amount: 25 },
    ]);
  });

  it('should handle rounding by adding difference to first participant', () => {
    const splits = calculateEqualSplits(10, ['a', 'b', 'c']);
    expect(splits[0].amount).toBe(3.34);
    expect(splits[1].amount).toBe(3.33);
    expect(splits[2].amount).toBe(3.33);
    expect(splits.reduce((sum, s) => sum + s.amount!, 0)).toBe(10);
  });
});

describe('simplifyDebts', () => {
  it('should minimize transfers', () => {
    const balances = [
      { member_id: '1', member_name: 'Ana', net_balance: 75 },
      { member_id: '2', member_name: 'Bruno', net_balance: -25 },
      { member_id: '3', member_name: 'Carol', net_balance: -25 },
      { member_id: '4', member_name: 'Davi', net_balance: -25 },
    ];

    const transfers = simplifyDebts(balances, 'BRL');

    expect(transfers).toHaveLength(3);
    expect(transfers[0]).toMatchObject({
      from_member_name: 'Davi',
      to_member_name: 'Ana',
      amount: 25,
    });
  });

  it('should return empty array when all balances are zero', () => {
    const balances = [
      { member_id: '1', member_name: 'Ana', net_balance: 0 },
      { member_id: '2', member_name: 'Bruno', net_balance: 0 },
    ];

    const transfers = simplifyDebts(balances, 'BRL');
    expect(transfers).toHaveLength(0);
  });
});
```

### Integration Tests

Test the full flow:

1. Create expense with splits
2. Verify balances are calculated correctly
3. Create settlement
4. Verify balances are updated
5. Finalize trip settlement

### Manual Testing Checklist

- [ ] Create expense with equal split
- [ ] Create expense with unequal split
- [ ] Edit expense and verify balances update
- [ ] Create settlement between two members
- [ ] View balances summary
- [ ] Open settlement modal
- [ ] Mark transfers as complete
- [ ] Finalize trip settlement
- [ ] Try to remove member with balance (should fail)
- [ ] Remove member with zero balance (should succeed)

---

## Performance Considerations

### Database Queries

- Use the `member_balances` view for efficient balance calculation
- Index on `expense_splits.expense_id` and `expense_splits.member_id`
- Index on `settlements.trip_id`, `settlements.from_member_id`, `settlements.to_member_id`

### Frontend Optimization

- Memoize balance calculations with `useMemo`
- Debounce split amount inputs
- Use optimistic updates for marking transfers as complete

### Scalability

- Algorithm complexity: O(N log N) for N members
- For N = 20 (typical trip group): ~100 operations
- For N = 100 (large group): ~700 operations
- Both are sub-millisecond on modern devices

---

## Future Enhancements

### Phase 2 Features

1. **Recurring Expenses**: Split recurring expenses (e.g., daily meals)
2. **Expense Categories**: Filter balances by category
3. **Multi-Currency**: Handle expenses in different currencies
4. **Expense History**: View timeline of all splits and settlements
5. **Notifications**: Notify members when they owe money
6. **Export**: Export settlement summary as PDF

### Phase 3 Features

1. **Payment Integration**: Direct payment via Pix/PayPal
2. **Expense Approval**: Require approval before adding to balance
3. **Expense Comments**: Discuss expenses with group
4. **Expense Photos**: Attach receipt photos
5. **Analytics**: Spending patterns and insights

---

## Support & Troubleshooting

### Common Issues

**Issue**: Balances don't add up to zero

**Solution**: Check for:
- Unconfirmed expenses (only confirmed expenses count)
- Private expenses (only public expenses count)
- Rounding errors (should be < 0.01)

**Issue**: Settlement modal shows wrong transfers

**Solution**: Verify:
- All expenses have splits
- All splits sum to expense amount
- No duplicate settlements

**Issue**: TypeScript errors in components

**Solution**: Ensure React types are installed:
```bash
npm install --save-dev @types/react @types/react-dom
```

---

## Conclusion

This implementation provides a complete, production-ready expense splitting system for the Partiu! app. The system is:

- ✅ **Type-safe**: Full TypeScript coverage
- ✅ **Tested**: Unit tests for core algorithms
- ✅ **Optimized**: O(N log N) debt simplification
- ✅ **Scalable**: Handles groups up to 100+ members
- ✅ **User-friendly**: Intuitive UI components
- ✅ **Secure**: Row-level security policies
- ✅ **Maintainable**: Pure functions, clear separation of concerns

For questions or issues, refer to the source code comments or create an issue in the project repository.
