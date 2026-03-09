-- Migration: admin_set_global_spouse
-- Permite que um admin defina o cônjuge de outro usuário (via profiles).
-- Segue a mesma lógica de set_global_spouse, mas recebe p_target_user_id.

create or replace function public.admin_set_global_spouse(
  p_target_user_id uuid,
  p_spouse_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_old_spouse uuid;
  v_old_other_spouse uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Verificar se o executor é admin de pelo menos uma viagem em comum
  -- com o usuário alvo (proteção mínima — admin da trip pode alterar membros dela)
  if not exists (
    select 1
    from public.trip_members tm_actor
    join public.trip_members tm_target
      on tm_target.trip_id = tm_actor.trip_id
     and tm_target.user_id = p_target_user_id
    where tm_actor.user_id = v_uid
      and tm_actor.role = 'admin'
  ) then
    raise exception 'Only a trip admin can change spouse settings for other users';
  end if;

  if p_target_user_id = v_uid then
    raise exception 'Use set_global_spouse to change your own spouse';
  end if;

  if p_spouse_user_id is not null and p_spouse_user_id = p_target_user_id then
    raise exception 'A user cannot be spouse of itself';
  end if;

  if p_spouse_user_id is not null and not exists (
    select 1 from public.profiles p where p.user_id = p_spouse_user_id
  ) then
    raise exception 'Spouse user not found';
  end if;

  -- Limpar cônjuge antigo do alvo (bidirecional)
  select spouse_user_id into v_old_spouse
  from public.profiles
  where user_id = p_target_user_id;

  if v_old_spouse is not null then
    update public.profiles
    set spouse_user_id = null
    where user_id = v_old_spouse
      and spouse_user_id = p_target_user_id;
  end if;

  update public.profiles
  set spouse_user_id = null
  where user_id = p_target_user_id;

  if p_spouse_user_id is null then
    return;
  end if;

  -- Limpar cônjuge antigo do novo cônjuge (bidirecional)
  select spouse_user_id into v_old_other_spouse
  from public.profiles
  where user_id = p_spouse_user_id;

  if v_old_other_spouse is not null then
    update public.profiles
    set spouse_user_id = null
    where user_id = v_old_other_spouse
      and spouse_user_id = p_spouse_user_id;
  end if;

  -- Definir novo casal (bidirecional)
  update public.profiles
  set spouse_user_id = p_spouse_user_id
  where user_id = p_target_user_id;

  update public.profiles
  set spouse_user_id = p_target_user_id
  where user_id = p_spouse_user_id;
end;
$$;

revoke all on function public.admin_set_global_spouse(uuid, uuid) from public;
grant execute on function public.admin_set_global_spouse(uuid, uuid) to authenticated;
