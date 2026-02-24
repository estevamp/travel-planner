-- Add category_id column to expenses table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'expenses' 
      AND column_name = 'category_id'
  ) THEN
    ALTER TABLE public.expenses 
    ADD COLUMN category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses(category_id);
    
    RAISE NOTICE 'Column category_id added to expenses table';
  ELSE
    RAISE NOTICE 'Column category_id already exists in expenses table';
  END IF;
END $$;
