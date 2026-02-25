-- Add is_confirmed column to expenses table
-- This allows tracking of confirmed vs predicted expenses

alter table public.expenses 
  add column if not exists is_confirmed boolean not null default false;

-- Add index for better query performance when filtering by confirmation status
create index if not exists idx_expenses_is_confirmed on public.expenses(is_confirmed);

-- Add comment for documentation
comment on column public.expenses.is_confirmed is 'Indicates whether the expense is confirmed (true) or predicted/planned (false)';
