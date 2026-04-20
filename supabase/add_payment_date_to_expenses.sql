-- Add payment_date to expenses table
alter table public.expenses add column if not exists payment_date date;
