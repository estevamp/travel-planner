-- Apply this migration to existing databases.
-- It keeps invite acceptance retry-safe and prevents an invited new user from
-- being routed into the first-trip creation onboarding flow.
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

  if lower(v_invite.email) <> v_email then
    raise exception 'Este convite foi emitido para %', v_invite.email;
  end if;

  if v_invite.accepted_at is not null then
    if v_invite.accepted_by_user_id = v_uid then
      return v_invite.trip_id;
    end if;
    raise exception 'Invite already accepted';
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

  update public.profiles
  set onboarding_status = 'completed',
      onboarding_trip_id = null
  where user_id = v_uid
    and onboarding_status = 'active';

  return v_invite.trip_id;
end;
$$;
