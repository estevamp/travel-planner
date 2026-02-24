-- Voyage schema for Supabase (Postgres)
create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text,
  start_date timestamptz,
  end_date timestamptz,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  display_name text,
  spouse_member_id uuid null,
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email text not null,
  token text not null unique,
  invited_by_member_id uuid not null references public.trip_members(id) on delete cascade,
  accepted_at timestamptz,
  accepted_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.itinerary (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_member_id uuid references public.trip_members(id) on delete cascade,
  type text not null check (type in ('flight', 'bus', 'hotel', 'activity')),
  title text not null,
  description text,
  location text,
  start_time timestamptz,
  end_time timestamptz,
  amount numeric(12,2) not null default 0,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_member_id uuid references public.trip_members(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null,
  currency text not null default 'BRL',
  category text,
  date date,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by_member_id uuid references public.trip_members(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.trips add column if not exists created_by_user_id uuid references auth.users(id);
alter table public.profiles add column if not exists theme_palette text not null default 'default';
alter table public.profiles add column if not exists dark_mode boolean not null default false;
alter table public.profiles add column if not exists default_currency text not null default 'BRL';
alter table public.profiles add column if not exists budget_limit numeric(12,2) not null default 0;
alter table public.itinerary add column if not exists created_by_member_id uuid references public.trip_members(id) on delete cascade;
alter table public.itinerary add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));
alter table public.expenses add column if not exists created_by_member_id uuid references public.trip_members(id) on delete cascade;
alter table public.expenses add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));
alter table public.expenses add column if not exists itinerary_item_id uuid references public.itinerary(id) on delete cascade;
alter table public.documents add column if not exists created_by_member_id uuid references public.trip_members(id) on delete cascade;

alter table public.trip_members
  drop constraint if exists trip_members_spouse_member_id_fkey,
  add constraint trip_members_spouse_member_id_fkey
  foreign key (spouse_member_id)
  references public.trip_members(id)
  on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_default_currency_len_chk'
  ) then
    alter table public.profiles
      add constraint profiles_default_currency_len_chk
      check (char_length(default_currency) = 3);
  end if;
end
$$;

create unique index if not exists idx_trip_invites_unique_trip_email
  on public.trip_invites (trip_id, lower(email));
create index if not exists idx_trip_members_trip_id on public.trip_members(trip_id);
create index if not exists idx_trip_members_user_id on public.trip_members(user_id);
create index if not exists idx_trip_invites_trip_id on public.trip_invites(trip_id);
create index if not exists idx_itinerary_trip_id on public.itinerary(trip_id);
create index if not exists idx_expenses_trip_id on public.expenses(trip_id);
create index if not exists idx_expenses_itinerary_item_id on public.expenses(itinerary_item_id);
create index if not exists idx_documents_trip_id on public.documents(trip_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.sync_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    v_uid,
    coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', auth.jwt() -> 'user_metadata' ->> 'name'),
    auth.jwt() -> 'user_metadata' ->> 'avatar_url'
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      avatar_url = excluded.avatar_url;
end;
$$;

create or replace function public.current_member_id(p_trip_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.id
  from public.trip_members tm
  where tm.trip_id = p_trip_id
    and tm.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_trip_admin(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;

create or replace function public.can_view_owner_data(p_trip_id uuid, p_owner_member_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_member uuid;
begin
  v_current_member := public.current_member_id(p_trip_id);
  if v_current_member is null then
    return false;
  end if;

  if v_current_member = p_owner_member_id then
    return true;
  end if;

  return exists (
    select 1
    from public.trip_members me
    join public.trip_members owner_member
      on owner_member.id = p_owner_member_id
     and owner_member.trip_id = p_trip_id
    where me.id = v_current_member
      and me.trip_id = p_trip_id
      and (
        me.spouse_member_id = p_owner_member_id
        or owner_member.spouse_member_id = v_current_member
      )
  );
end;
$$;

create or replace function public.can_view_scoped_data(p_trip_id uuid, p_owner_member_id uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      p_visibility = 'public'
      and public.is_trip_member(p_trip_id)
    )
    or public.can_view_owner_data(p_trip_id, p_owner_member_id);
$$;

create or replace function public.create_trip_with_admin(
  p_name text,
  p_destination text,
  p_start timestamptz,
  p_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_trip_id uuid;
  v_display_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Trip name is required';
  end if;

  insert into public.trips (name, destination, start_date, end_date, created_by_user_id)
  values (trim(p_name), trim(coalesce(p_destination, '')), p_start, p_end, v_uid)
  returning id into v_trip_id;

  select coalesce(p.full_name, auth.jwt() ->> 'email')
    into v_display_name
  from public.profiles p
  where p.user_id = v_uid;

  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip_id, v_uid, 'admin', v_display_name);

  return v_trip_id;
end;
$$;

create or replace function public.create_trip_invite(
  p_trip_id uuid,
  p_email text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_existing record;
  v_member_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_trip_admin(p_trip_id) then
    raise exception 'Only admin can invite';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  select * into v_existing
  from public.trip_invites
  where trip_id = p_trip_id
    and lower(email) = v_email
  limit 1;

  if found then
    if v_existing.accepted_at is not null then
      raise exception 'This email has already accepted an invite for this trip';
    end if;
    return v_existing.token;
  end if;

  select tm.id into v_member_id
  from public.trip_members tm
  where tm.trip_id = p_trip_id
    and tm.user_id = auth.uid()
  limit 1;

  if v_member_id is null then
    raise exception 'Trip membership not found';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.trip_invites (trip_id, email, token, invited_by_member_id)
  values (p_trip_id, v_email, v_token, v_member_id);

  return v_token;
end;
$$;

create or replace function public.accept_trip_invite(
  p_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_email text;
  v_invite public.trip_invites%rowtype;
  v_existing_member_id uuid;
  v_display_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is required';
  end if;

  select * into v_invite
  from public.trip_invites
  where token = p_token
  limit 1;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'Este convite foi emitido para %', v_invite.email;
  end if;

  select tm.id into v_existing_member_id
  from public.trip_members tm
  where tm.trip_id = v_invite.trip_id
    and tm.user_id = v_uid
  limit 1;

  if v_existing_member_id is null then
    select coalesce(p.full_name, auth.jwt() ->> 'email')
      into v_display_name
    from public.profiles p
    where p.user_id = v_uid;

    insert into public.trip_members (trip_id, user_id, role, display_name)
    values (v_invite.trip_id, v_uid, 'member', v_display_name);
  end if;

  update public.trip_invites
  set accepted_at = now(),
      accepted_by_user_id = v_uid
  where id = v_invite.id;

  return v_invite.trip_id;
end;
$$;

create or replace function public.cancel_trip_invite(
  p_trip_id uuid,
  p_invite_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepted_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_trip_admin(p_trip_id) then
    raise exception 'Only admin can cancel invites';
  end if;

  select accepted_at into v_accepted_at
  from public.trip_invites
  where id = p_invite_id
    and trip_id = p_trip_id
  limit 1;

  if not found then
    raise exception 'Invite not found';
  end if;

  if v_accepted_at is not null then
    raise exception 'Invite already accepted';
  end if;

  delete from public.trip_invites
  where id = p_invite_id
    and trip_id = p_trip_id;
end;
$$;

create or replace function public.set_trip_spouse(
  p_trip_id uuid,
  p_member_id uuid,
  p_spouse_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_member_id uuid;
  v_actor_member_id uuid;
  v_is_admin boolean;
  v_old_spouse uuid;
  v_old_other_spouse uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_actor_member_id := public.current_member_id(p_trip_id);
  if v_actor_member_id is null then
    raise exception 'Trip membership not found';
  end if;

  v_is_admin := public.is_trip_admin(p_trip_id);
  v_target_member_id := coalesce(p_member_id, v_actor_member_id);

  if not v_is_admin and v_target_member_id <> v_actor_member_id then
    raise exception 'Only admin can change spouse settings for other members';
  end if;

  if not exists (
    select 1
    from public.trip_members tm
    where tm.id = v_target_member_id
      and tm.trip_id = p_trip_id
  ) then
    raise exception 'Member not found in trip';
  end if;

  if p_spouse_member_id is not null and p_spouse_member_id = v_target_member_id then
    raise exception 'A member cannot be spouse of itself';
  end if;

  if p_spouse_member_id is not null and not exists (
    select 1
    from public.trip_members tm
    where tm.id = p_spouse_member_id
      and tm.trip_id = p_trip_id
  ) then
    raise exception 'Spouse member not found in trip';
  end if;

  select spouse_member_id into v_old_spouse
  from public.trip_members
  where id = v_target_member_id;

  if v_old_spouse is not null then
    update public.trip_members
    set spouse_member_id = null
    where id = v_old_spouse;
  end if;

  update public.trip_members
  set spouse_member_id = null
  where id = v_target_member_id;

  if p_spouse_member_id is null then
    return;
  end if;

  select spouse_member_id into v_old_other_spouse
  from public.trip_members
  where id = p_spouse_member_id;

  if v_old_other_spouse is not null then
    update public.trip_members
    set spouse_member_id = null
    where id = v_old_other_spouse;
  end if;

  update public.trip_members
  set spouse_member_id = p_spouse_member_id
  where id = v_target_member_id;

  update public.trip_members
  set spouse_member_id = v_target_member_id
  where id = p_spouse_member_id;
end;
$$;

alter table public.trips enable row level security;
alter table public.profiles enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.itinerary enable row level security;
alter table public.expenses enable row level security;
alter table public.documents enable row level security;

drop policy if exists trips_public_rw on public.trips;
drop policy if exists itinerary_public_rw on public.itinerary;
drop policy if exists expenses_public_rw on public.expenses;
drop policy if exists documents_public_rw on public.documents;

drop policy if exists trips_select_member on public.trips;
drop policy if exists trips_update_admin on public.trips;
drop policy if exists trips_delete_admin on public.trips;
create policy trips_select_member on public.trips
for select using (public.is_trip_member(id));
create policy trips_update_admin on public.trips
for update using (public.is_trip_admin(id))
with check (public.is_trip_admin(id));
create policy trips_delete_admin on public.trips
for delete using (public.is_trip_admin(id));

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
for select using (user_id = auth.uid());
create policy profiles_update_own on public.profiles
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists trip_members_select_member on public.trip_members;
drop policy if exists trip_members_update_admin on public.trip_members;
drop policy if exists trip_members_delete_admin on public.trip_members;
create policy trip_members_select_member on public.trip_members
for select using (public.is_trip_member(trip_id));
create policy trip_members_update_admin on public.trip_members
for update using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy trip_members_delete_admin on public.trip_members
for delete using (public.is_trip_admin(trip_id));

drop policy if exists trip_invites_select_admin on public.trip_invites;
drop policy if exists trip_invites_update_admin on public.trip_invites;
drop policy if exists trip_invites_delete_admin on public.trip_invites;
create policy trip_invites_select_admin on public.trip_invites
for select using (public.is_trip_admin(trip_id));
create policy trip_invites_update_admin on public.trip_invites
for update using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy trip_invites_delete_admin on public.trip_invites
for delete using (public.is_trip_admin(trip_id));

drop policy if exists itinerary_select_visibility on public.itinerary;
drop policy if exists itinerary_insert_member on public.itinerary;
drop policy if exists itinerary_update_owner_or_admin on public.itinerary;
drop policy if exists itinerary_delete_owner_or_admin on public.itinerary;
create policy itinerary_select_visibility on public.itinerary
for select using (public.can_view_scoped_data(trip_id, created_by_member_id, visibility));
create policy itinerary_insert_member on public.itinerary
for insert with check (created_by_member_id = public.current_member_id(trip_id));
create policy itinerary_update_owner_or_admin on public.itinerary
for update using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
)
with check (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);
create policy itinerary_delete_owner_or_admin on public.itinerary
for delete using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);

drop policy if exists expenses_select_visibility on public.expenses;
drop policy if exists expenses_insert_member on public.expenses;
drop policy if exists expenses_update_owner_or_admin on public.expenses;
drop policy if exists expenses_delete_owner_or_admin on public.expenses;
create policy expenses_select_visibility on public.expenses
for select using (public.can_view_scoped_data(trip_id, created_by_member_id, visibility));
create policy expenses_insert_member on public.expenses
for insert with check (created_by_member_id = public.current_member_id(trip_id));
create policy expenses_update_owner_or_admin on public.expenses
for update using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
)
with check (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);
create policy expenses_delete_owner_or_admin on public.expenses
for delete using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);

drop policy if exists documents_select_owner_or_spouse on public.documents;
drop policy if exists documents_insert_member on public.documents;
drop policy if exists documents_update_owner_or_admin on public.documents;
drop policy if exists documents_delete_owner_or_admin on public.documents;
create policy documents_select_owner_or_spouse on public.documents
for select using (public.can_view_owner_data(trip_id, created_by_member_id));
create policy documents_insert_member on public.documents
for insert with check (created_by_member_id = public.current_member_id(trip_id));
create policy documents_update_owner_or_admin on public.documents
for update using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
)
with check (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);
create policy documents_delete_owner_or_admin on public.documents
for delete using (
  created_by_member_id = public.current_member_id(trip_id)
  or public.is_trip_admin(trip_id)
);

insert into storage.buckets (id, name, public)
values ('travel-documents', 'travel-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists docs_bucket_select on storage.objects;
drop policy if exists docs_bucket_insert on storage.objects;
drop policy if exists docs_bucket_update on storage.objects;
drop policy if exists docs_bucket_delete on storage.objects;

create policy docs_bucket_select on storage.objects
for select using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.can_view_owner_data(
    split_part(name, '/', 1)::uuid,
    split_part(name, '/', 2)::uuid
  )
);

create policy docs_bucket_insert on storage.objects
for insert with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
);

create policy docs_bucket_update on storage.objects
for update using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
)
with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
);

create policy docs_bucket_delete on storage.objects
for delete using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
);

revoke all on function public.sync_my_profile() from public;
revoke all on function public.current_member_id(uuid) from public;
revoke all on function public.is_trip_member(uuid) from public;
revoke all on function public.is_trip_admin(uuid) from public;
revoke all on function public.can_view_owner_data(uuid, uuid) from public;
revoke all on function public.can_view_scoped_data(uuid, uuid, text) from public;
revoke all on function public.create_trip_with_admin(text, text, timestamptz, timestamptz) from public;
revoke all on function public.create_trip_invite(uuid, text) from public;
revoke all on function public.accept_trip_invite(text) from public;
revoke all on function public.cancel_trip_invite(uuid, uuid) from public;
revoke all on function public.set_trip_spouse(uuid, uuid, uuid) from public;

grant execute on function public.sync_my_profile() to authenticated;
grant execute on function public.current_member_id(uuid) to authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_admin(uuid) to authenticated;
grant execute on function public.can_view_owner_data(uuid, uuid) to authenticated;
grant execute on function public.can_view_scoped_data(uuid, uuid, text) to authenticated;
grant execute on function public.create_trip_with_admin(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.create_trip_invite(uuid, text) to authenticated;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.cancel_trip_invite(uuid, uuid) to authenticated;
grant execute on function public.set_trip_spouse(uuid, uuid, uuid) to authenticated;

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

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_members'
  ) then
    alter publication supabase_realtime add table public.trip_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_invites'
  ) then
    alter publication supabase_realtime add table public.trip_invites;
  end if;
end $$;
