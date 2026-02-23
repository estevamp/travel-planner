-- Voyage schema for Supabase (Postgres)
create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.itinerary (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  type text not null check (type in ('flight', 'bus', 'hotel', 'activity')),
  title text not null,
  description text,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  amount numeric(12,2) not null default 0,
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  currency text not null default 'BRL',
  category text,
  date date,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_itinerary_trip_id on public.itinerary(trip_id);
create index if not exists idx_expenses_trip_id on public.expenses(trip_id);
create index if not exists idx_documents_trip_id on public.documents(trip_id);

alter table public.trips enable row level security;
alter table public.itinerary enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;

-- Demo policies: public read/write using anon key.
-- For production, replace by authenticated user-based policies.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'trips_public_rw' and tablename = 'trips') then
    create policy trips_public_rw on public.trips for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'itinerary_public_rw' and tablename = 'itinerary') then
    create policy itinerary_public_rw on public.itinerary for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'expenses_public_rw' and tablename = 'expenses') then
    create policy expenses_public_rw on public.expenses for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'documents_public_rw' and tablename = 'documents') then
    create policy documents_public_rw on public.documents for all using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itinerary'
  ) then
    alter publication supabase_realtime add table public.itinerary;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
end $$;
