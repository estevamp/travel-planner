-- Fix RLS policies for itinerary_types table
-- The table has RLS enabled but no policies were defined for it in schema.sql,
-- causing "new row violates row-level security policy" on inserts.

-- Allow all authenticated users to view itinerary types
drop policy if exists "itinerary_types_select_all" on public.itinerary_types;
create policy "itinerary_types_select_all" on public.itinerary_types
for select using (true);

-- Allow all authenticated users to manage itinerary types (insert, update, delete)
-- This matches the behavior of expense_categories in schema.sql
drop policy if exists "itinerary_types_all_authenticated" on public.itinerary_types;
create policy "itinerary_types_all_authenticated" on public.itinerary_types
for all using (
  auth.role() = 'authenticated'
) with check (
  auth.role() = 'authenticated'
);
