-- First, run this query to gather the actual IDs and amounts needed:
-- 
-- SELECT 
--   e.id as expense_id,
--   e.description,
--   e.amount,
--   e.currency,
--   COALESCE((SELECT COUNT(*) FROM public.expense_splits WHERE expense_id = e.id), 0) + 1 as total_participants,
--   (e.amount / (COALESCE((SELECT COUNT(*) FROM public.expense_splits WHERE expense_id = e.id), 0) + 1))::numeric(10,2) as equal_split_amount
-- FROM public.expenses e
-- WHERE e.description ILIKE '%Airbnb NY%' 
--    OR e.description ILIKE '%Carro Los Angeles%'
--    OR e.description ILIKE '%Hotel Hilton 2%'
-- ORDER BY e.description;
-- 
-- SELECT id, display_name FROM public.trip_members WHERE display_name ILIKE '%Estevam%';
--
-- Then populate the UUIDs below and run this migration:

-- Find Estevam's member_id (to be filled in from query above)
-- Find the three expense IDs (to be filled in from query above)

-- Expense 1: Airbnb NY 5/6 (2,277 BRL)
INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
VALUES (
  '{{AIRBNB_EXPENSE_ID}}',   -- Replace with actual UUID from query
  '{{ESTEVAM_MEMBER_ID}}',   -- Replace with actual UUID
  569.25,                    -- Replace with Estevam's actual share (e.g., 2277/4 = 569.25)
  25.00
)
ON CONFLICT (expense_id, member_id) DO NOTHING;

-- Expense 2: Carro Los Angeles (2,500 BRL)
INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
VALUES (
  '{{CARRO_EXPENSE_ID}}',    -- Replace with actual UUID from query
  '{{ESTEVAM_MEMBER_ID}}',   -- Replace with actual UUID
  833.33,                    -- Replace with Estevam's actual share (e.g., 2500/3 = 833.33)
  33.33
)
ON CONFLICT (expense_id, member_id) DO NOTHING;

-- Expense 3: Hotel Hilton 2 (1,213 USD)
INSERT INTO public.expense_splits (expense_id, member_id, amount, percentage)
VALUES (
  '{{HOTEL_EXPENSE_ID}}',    -- Replace with actual UUID from query
  '{{ESTEVAM_MEMBER_ID}}',   -- Replace with actual UUID
  242.60,                    -- Replace with Estevam's actual share (e.g., 1213/5 = 242.60)
  20.00
)
ON CONFLICT (expense_id, member_id) DO NOTHING;

-- Verify the changes
SELECT 
  e.id as expense_id,
  e.description,
  e.amount,
  e.currency,
  tm.display_name,
  es.amount as split_amount,
  es.percentage
FROM public.expenses e
JOIN public.expense_splits es ON e.id = es.expense_id
JOIN public.trip_members tm ON es.member_id = tm.id
WHERE e.description ILIKE '%Airbnb NY%' 
   OR e.description ILIKE '%Carro Los Angeles%'
   OR e.description ILIKE '%Hotel Hilton 2%'
ORDER BY e.description, tm.display_name;
