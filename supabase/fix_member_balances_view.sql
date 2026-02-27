-- Migration: Update member_balances view to handle empty expenses correctly
-- This migration updates the view without trying to recreate existing columns

CREATE OR REPLACE VIEW member_balances AS
SELECT
  tm.id AS member_id,
  tm.trip_id,
  tm.display_name AS member_name,
  CASE 
    WHEN paid.total_paid IS NULL AND owed.total_owed IS NULL AND settled.has_settlements IS NULL THEN 0
    ELSE COALESCE(paid.total_paid, 0) - COALESCE(owed.total_owed, 0) + COALESCE(settled.net_settled, 0)
  END AS net_balance
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
    COALESCE(paid_out.total, 0) - COALESCE(received.total, 0) AS net_settled,
    CASE WHEN paid_out.total IS NOT NULL OR received.total IS NOT NULL THEN TRUE ELSE NULL END as has_settlements
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
