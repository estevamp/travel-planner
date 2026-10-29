-- Link a member-to-member settlement to the expense it pays.
ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_settlements_expense_id ON settlements(expense_id);
