-- Migration: Add expense splitting support
-- This migration adds tables and columns to support Splitwise-like expense splitting

-- 1. Add paid_by_member_id and split_type to expenses table
ALTER TABLE expenses
ADD COLUMN paid_by_member_id UUID REFERENCES trip_members(id),
ADD COLUMN split_type TEXT CHECK (split_type IN ('equal', 'unequal')) DEFAULT 'equal';

-- 2. Create expense_splits table
CREATE TABLE expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  percentage DECIMAL(5, 2) CHECK (percentage >= 0 AND percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, member_id)
);

-- 3. Create settlements table (for partial payments between members)
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

-- 4. Create trip_settlement_status table (tracks if trip is fully settled)
CREATE TABLE trip_settlement_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE UNIQUE,
  is_settled BOOLEAN DEFAULT FALSE,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for performance
CREATE INDEX idx_expense_splits_expense_id ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_member_id ON expense_splits(member_id);
CREATE INDEX idx_settlements_trip_id ON settlements(trip_id);
CREATE INDEX idx_settlements_from_member ON settlements(from_member_id);
CREATE INDEX idx_settlements_to_member ON settlements(to_member_id);
CREATE INDEX idx_trip_settlement_status_trip_id ON trip_settlement_status(trip_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_settlement_status ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for expense_splits
-- Users can view splits for expenses in their trips
CREATE POLICY "Users can view expense splits in their trips"
  ON expense_splits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trip_members tm ON e.trip_id = tm.trip_id
      WHERE e.id = expense_splits.expense_id
      AND tm.user_id = auth.uid()
    )
  );

-- Users can insert splits for expenses they created
CREATE POLICY "Users can create expense splits for their expenses"
  ON expense_splits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trip_members tm ON e.created_by_member_id = tm.id
      WHERE e.id = expense_splits.expense_id
      AND tm.user_id = auth.uid()
    )
  );

-- Users can update splits for expenses they created
CREATE POLICY "Users can update expense splits for their expenses"
  ON expense_splits FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trip_members tm ON e.created_by_member_id = tm.id
      WHERE e.id = expense_splits.expense_id
      AND tm.user_id = auth.uid()
    )
  );

-- Users can delete splits for expenses they created
CREATE POLICY "Users can delete expense splits for their expenses"
  ON expense_splits FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trip_members tm ON e.created_by_member_id = tm.id
      WHERE e.id = expense_splits.expense_id
      AND tm.user_id = auth.uid()
    )
  );

-- 8. RLS Policies for settlements
-- Users can view settlements in their trips
CREATE POLICY "Users can view settlements in their trips"
  ON settlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = settlements.trip_id
      AND tm.user_id = auth.uid()
    )
  );

-- Users can create settlements in their trips
CREATE POLICY "Users can create settlements in their trips"
  ON settlements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = settlements.trip_id
      AND tm.user_id = auth.uid()
    )
  );

-- Users can update settlements they created
CREATE POLICY "Users can update their settlements"
  ON settlements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.id = settlements.from_member_id
      AND tm.user_id = auth.uid()
    )
  );

-- 9. RLS Policies for trip_settlement_status
-- Users can view settlement status for their trips
CREATE POLICY "Users can view trip settlement status"
  ON trip_settlement_status FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = trip_settlement_status.trip_id
      AND tm.user_id = auth.uid()
    )
  );

-- Trip admins can update settlement status
CREATE POLICY "Trip admins can update settlement status"
  ON trip_settlement_status FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trip_members tm
      WHERE tm.trip_id = trip_settlement_status.trip_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'admin'
    )
  );

-- 10. Create function to automatically create settlement status for new trips
CREATE OR REPLACE FUNCTION create_trip_settlement_status()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO trip_settlement_status (trip_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_trip_settlement_status
  AFTER INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION create_trip_settlement_status();

-- 11. Create view for easy balance calculation
CREATE OR REPLACE VIEW member_balances AS
SELECT
  tm.id AS member_id,
  tm.trip_id,
  tm.display_name AS member_name,
  COALESCE(paid.total_paid, 0) - COALESCE(owed.total_owed, 0) + COALESCE(settled.net_settled, 0) AS net_balance
FROM trip_members tm
LEFT JOIN (
  -- Total paid by member
  SELECT e.paid_by_member_id, SUM(e.amount) AS total_paid
  FROM expenses e
  WHERE e.is_confirmed = TRUE AND e.visibility = 'public'
  GROUP BY e.paid_by_member_id
) paid ON paid.paid_by_member_id = tm.id
LEFT JOIN (
  -- Total owed by member
  SELECT es.member_id, SUM(es.amount) AS total_owed
  FROM expense_splits es
  JOIN expenses e ON e.id = es.expense_id
  WHERE e.is_confirmed = TRUE AND e.visibility = 'public'
  GROUP BY es.member_id
) owed ON owed.member_id = tm.id
LEFT JOIN (
  -- Net settlements (paid - received)
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

COMMENT ON VIEW member_balances IS 'Calculates net balance for each trip member (positive = owed, negative = owes)';
