-- Migration: adicionar 'couple' como valor válido de visibility

-- Itinerary
alter table public.itinerary 
  drop constraint if exists itinerary_visibility_check,
  add constraint itinerary_visibility_check 
  check (visibility in ('public', 'couple', 'private'));

-- Expenses
alter table public.expenses 
  drop constraint if exists expenses_visibility_check,
  add constraint expenses_visibility_check 
  check (visibility in ('public', 'couple', 'private'));

-- Ideas
alter table public.ideas 
  drop constraint if exists ideas_visibility_check,
  add constraint ideas_visibility_check 
  check (visibility in ('public', 'couple', 'private'));

-- Update can_view_scoped_data function
create or replace function public.can_view_scoped_data(p_trip_id uuid, p_owner_member_id uuid, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case p_visibility
      -- 'public': qualquer membro da viagem pode ver
      when 'public' then public.is_trip_member(p_trip_id)
      -- 'couple': somente o criador ou seu cônjuge confirmado podem ver
      when 'couple' then public.can_view_owner_data(p_trip_id, p_owner_member_id)
      -- 'private': somente o próprio criador pode ver (sem cônjuge)
      when 'private' then (
        public.current_member_id(p_trip_id) = p_owner_member_id
      )
      else false
    end;
$$;
