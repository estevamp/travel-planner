-- Migration to remove legacy type column from itinerary table
-- The system now uses type_id to reference itinerary_types table

-- Drop the check constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_type_check'
  ) THEN
    ALTER TABLE public.itinerary DROP CONSTRAINT itinerary_type_check;
  END IF;
END $$;

-- Drop the type column if it exists
ALTER TABLE public.itinerary DROP COLUMN IF EXISTS type;

-- Ensure type_id column exists and is properly configured
ALTER TABLE public.itinerary 
  ADD COLUMN IF NOT EXISTS type_id uuid REFERENCES public.itinerary_types(id) ON DELETE SET NULL;

-- Create index on type_id for better query performance
CREATE INDEX IF NOT EXISTS idx_itinerary_type_id ON public.itinerary(type_id);
