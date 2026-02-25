-- Currency Migration Script
-- Adds currency field to itinerary, ideas, and trip_budgets tables

-- Add currency column to itinerary
ALTER TABLE public.itinerary 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';

-- Add currency column to ideas
ALTER TABLE public.ideas 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';

-- Add currency column to trip_budgets
ALTER TABLE public.trip_budgets 
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';

-- Add constraint to ensure currency is 3 characters (ISO 4217)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_currency_len_chk'
  ) THEN
    ALTER TABLE public.itinerary
      ADD CONSTRAINT itinerary_currency_len_chk 
      CHECK (char_length(currency) = 3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ideas_currency_len_chk'
  ) THEN
    ALTER TABLE public.ideas
      ADD CONSTRAINT ideas_currency_len_chk 
      CHECK (char_length(currency) = 3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_budgets_currency_len_chk'
  ) THEN
    ALTER TABLE public.trip_budgets
      ADD CONSTRAINT trip_budgets_currency_len_chk 
      CHECK (char_length(currency) = 3);
  END IF;
END $$;

-- Migrate existing data to use user's default currency
UPDATE public.itinerary i
SET currency = COALESCE(
  (SELECT p.default_currency 
   FROM public.trip_members tm
   JOIN public.profiles p ON p.user_id = tm.user_id
   WHERE tm.id = i.created_by_member_id),
  'BRL'
)
WHERE currency = 'BRL'; -- Only update default values

UPDATE public.ideas i
SET currency = COALESCE(
  (SELECT p.default_currency 
   FROM public.trip_members tm
   JOIN public.profiles p ON p.user_id = tm.user_id
   WHERE tm.id = i.created_by_member_id),
  'BRL'
)
WHERE currency = 'BRL'; -- Only update default values

UPDATE public.trip_budgets tb
SET currency = COALESCE(
  (SELECT p.default_currency 
   FROM public.profiles p
   WHERE p.user_id = tb.owner_user_id),
  'BRL'
)
WHERE currency = 'BRL'; -- Only update default values

-- Update upsert_trip_budget function to support currency
CREATE OR REPLACE FUNCTION public.upsert_trip_budget(
  p_trip_id uuid,
  p_budget_limit numeric,
  p_currency text DEFAULT 'BRL'
)
RETURNS public.trip_budgets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_owner_user_id uuid;
  v_budget public.trip_budgets;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Trip membership not found';
  END IF;

  IF p_budget_limit < 0 THEN
    RAISE EXCEPTION 'Budget limit must be >= 0';
  END IF;

  IF char_length(p_currency) != 3 THEN
    RAISE EXCEPTION 'Currency must be 3 characters (ISO 4217)';
  END IF;

  v_owner_user_id := public.budget_owner_user_id(p_trip_id, v_uid);
  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Budget owner resolution failed';
  END IF;

  INSERT INTO public.trip_budgets (trip_id, owner_user_id, budget_limit, currency)
  VALUES (p_trip_id, v_owner_user_id, p_budget_limit, p_currency)
  ON CONFLICT (trip_id, owner_user_id) DO UPDATE
    SET budget_limit = excluded.budget_limit,
        currency = excluded.currency,
        updated_at = now()
  RETURNING * INTO v_budget;

  RETURN v_budget;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION public.upsert_trip_budget(uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_trip_budget(uuid, numeric, text) TO authenticated;
