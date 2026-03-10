


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_trip_invite"("p_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid           uuid;
  v_email         text;
  v_invite        public.trip_invites%rowtype;
  v_existing_id   uuid;
  v_display_name  text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Authenticated email is required';
  END IF;

  SELECT * INTO v_invite
  FROM public.trip_invites
  WHERE token = p_token
  LIMIT 1;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  IF v_invite.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invite already accepted';
  END IF;

  IF lower(v_invite.email) <> v_email THEN
    RAISE EXCEPTION 'Este convite foi emitido para %', v_invite.email;
  END IF;

  SELECT coalesce(p.full_name, auth.jwt() ->> 'email')
    INTO v_display_name
  FROM public.profiles p
  WHERE p.user_id = v_uid;

  -- Verificar se já é membro ativo
  SELECT id INTO v_existing_id
  FROM public.trip_members
  WHERE trip_id = v_invite.trip_id AND user_id = v_uid
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    IF v_invite.guest_member_id IS NOT NULL THEN
      -- CLAIM: transformar o slot guest em membro real
      UPDATE public.trip_members
      SET
        user_id      = v_uid,
        display_name = coalesce(display_name, v_display_name),
        status       = 'active',
        guest_email  = NULL
      WHERE id = v_invite.guest_member_id
        AND trip_id = v_invite.trip_id;
    ELSE
      -- Novo membro normal
      INSERT INTO public.trip_members (trip_id, user_id, role, display_name, status)
      VALUES (v_invite.trip_id, v_uid, 'member', v_display_name, 'active');
    END IF;
  END IF;

  UPDATE public.trip_invites
  SET accepted_at = now(), accepted_by_user_id = v_uid
  WHERE id = v_invite.id;

  RETURN v_invite.trip_id;
END;
$$;


ALTER FUNCTION "public"."accept_trip_invite"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_member_id uuid;
  v_name      text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_trip_admin(p_trip_id) THEN
    RAISE EXCEPTION 'Only admins can add guest members';
  END IF;

  v_name := trim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;

  INSERT INTO public.trip_members (trip_id, user_id, role, display_name, status, guest_email)
  VALUES (p_trip_id, NULL, 'member', v_name, 'guest', lower(trim(coalesce(p_email, ''))) )
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;


ALTER FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_spouse_user_id uuid;
begin
  v_user_id := coalesce(p_user_id, auth.uid());
  if v_user_id is null then
    return null;
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = v_user_id
  ) then
    return null;
  end if;

  select p.spouse_user_id into v_spouse_user_id
  from public.profiles p
  where p.user_id = v_user_id;

  if v_spouse_user_id is null then
    return v_user_id;
  end if;

  if not exists (
    select 1 from public.profiles sp
    where sp.user_id = v_spouse_user_id
      and sp.spouse_user_id = v_user_id
  ) then
    return v_user_id;
  end if;

  if not exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = v_spouse_user_id
  ) then
    return v_user_id;
  end if;

  return least(v_user_id, v_spouse_user_id);
end;
$$;


ALTER FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_current_member uuid;
  v_current_user uuid;
  v_owner_user uuid;
begin
  v_current_member := public.current_member_id(p_trip_id);
  if v_current_member is null then
    return false;
  end if;

  select tm.user_id into v_current_user
  from public.trip_members tm
  where tm.id = v_current_member
  limit 1;

  select tm.user_id into v_owner_user
  from public.trip_members tm
  where tm.id = p_owner_member_id
    and tm.trip_id = p_trip_id
  limit 1;

  if v_current_user is null or v_owner_user is null then
    return false;
  end if;

  if v_current_user = v_owner_user then
    return true;
  end if;

  return exists (
    select 1
    from public.profiles current_profile
    join public.profiles owner_profile on owner_profile.user_id = v_owner_user
    where current_profile.user_id = v_current_user
      and current_profile.spouse_user_id = v_owner_user
      and owner_profile.spouse_user_id = v_current_user
  );
end;
$$;


ALTER FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    (
      p_visibility = 'public'
      and public.is_trip_member(p_trip_id)
    )
    or public.can_view_owner_data(p_trip_id, p_owner_member_id);
$$;


ALTER FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip"("p_name" "text", "p_destination" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_trip_id uuid;
  v_uid uuid;
  v_display_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.trips (name, destination)
  values (p_name, p_destination)
  returning id into v_trip_id;

  select display_name into v_display_name
  from public.profiles
  where user_id = v_uid;

  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip_id, v_uid, 'admin', v_display_name);

  return v_trip_id;
end;
$$;


ALTER FUNCTION "public"."create_trip"("p_name" "text", "p_destination" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_settlement_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO trip_settlement_status (trip_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_trip_settlement_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_member_id"("p_trip_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select tm.id
  from public.trip_members tm
  where tm.trip_id = p_trip_id
    and tm.user_id = auth.uid()
  limit 1;
$$;


ALTER FUNCTION "public"."current_member_id"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_token     text;
  v_email     text;
  v_inviter   uuid;
  v_status    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_trip_admin(p_trip_id) THEN
    RAISE EXCEPTION 'Only admins can send invites';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT status INTO v_status
  FROM public.trip_members
  WHERE id = p_member_id AND trip_id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_status <> 'guest' THEN
    RAISE EXCEPTION 'Member is already active';
  END IF;

  -- Verificar se já existe invite pendente para este email nesta viagem
  IF EXISTS (
    SELECT 1 FROM public.trip_invites
    WHERE trip_id = p_trip_id AND lower(email) = v_email AND accepted_at IS NULL
  ) THEN
    SELECT token INTO v_token
    FROM public.trip_invites
    WHERE trip_id = p_trip_id AND lower(email) = v_email AND accepted_at IS NULL
    LIMIT 1;
    RETURN v_token;
  END IF;

  SELECT tm.id INTO v_inviter
  FROM public.trip_members tm
  WHERE tm.trip_id = p_trip_id AND tm.user_id = auth.uid()
  LIMIT 1;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.trip_invites (trip_id, email, token, invited_by_member_id, guest_member_id)
  VALUES (p_trip_id, v_email, v_token, v_inviter, p_member_id);

  -- Atualizar guest_email no membro
  UPDATE public.trip_members
  SET guest_email = v_email
  WHERE id = p_member_id;

  RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_trip_admin(p_trip_id) THEN
    RAISE EXCEPTION 'Only admins can remove guest members';
  END IF;

  SELECT status INTO v_status
  FROM public.trip_members
  WHERE id = p_member_id AND trip_id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF v_status <> 'guest' THEN
    RAISE EXCEPTION 'Only guest members can be removed this way';
  END IF;

  -- Bloquear remoção se tem splits ou pagamentos vinculados
  IF EXISTS (
    SELECT 1 FROM public.expense_splits es
    JOIN public.expenses e ON e.id = es.expense_id
    WHERE es.member_id = p_member_id AND e.trip_id = p_trip_id
  ) OR EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.paid_by_member_id = p_member_id AND e.trip_id = p_trip_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove guest with existing expense records';
  END IF;

  DELETE FROM public.trip_members
  WHERE id = p_member_id AND trip_id = p_trip_id;
END;
$$;


ALTER FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid;
  v_old_spouse uuid;
  v_old_other_spouse uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_spouse_user_id is not null and p_spouse_user_id = v_uid then
    raise exception 'A user cannot be spouse of itself';
  end if;

  if p_spouse_user_id is not null and not exists (
    select 1 from public.profiles p where p.user_id = p_spouse_user_id
  ) then
    raise exception 'Spouse user not found';
  end if;

  select spouse_user_id into v_old_spouse
  from public.profiles
  where user_id = v_uid;

  if v_old_spouse is not null then
    update public.profiles
    set spouse_user_id = null
    where user_id = v_old_spouse
      and spouse_user_id = v_uid;
  end if;

  update public.profiles
  set spouse_user_id = null
  where user_id = v_uid;

  if p_spouse_user_id is null then
    return;
  end if;

  select spouse_user_id into v_old_other_spouse
  from public.profiles
  where user_id = p_spouse_user_id;

  if v_old_other_spouse is not null then
    update public.profiles
    set spouse_user_id = null
    where user_id = v_old_other_spouse
      and spouse_user_id = p_spouse_user_id;
  end if;

  update public.profiles
  set spouse_user_id = p_spouse_user_id
  where user_id = v_uid;

  update public.profiles
  set spouse_user_id = v_uid
  where user_id = p_spouse_user_id;
end;
$$;


ALTER FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_my_profile"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid;
  v_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_name := trim(p_display_name);
  if v_name = '' then
    raise exception 'Display name cannot be empty';
  end if;

  update public.trip_members
  set display_name = v_name
  where trip_id = p_trip_id
    and user_id = v_uid;

  if not found then
    raise exception 'Member not found in this trip';
  end if;
end;
$$;


ALTER FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid;
  v_name text;
  v_target_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  v_target_uid := coalesce(p_target_user_id, v_uid);

  -- Se o alvo não for o próprio usuário, verifica se o usuário é admin da viagem
  if v_target_uid <> v_uid and not public.is_trip_admin(p_trip_id) then
    raise exception 'Only admins can change other members names';
  end if;

  v_name := trim(p_display_name);
  if v_name = '' then
    raise exception 'Display name cannot be empty';
  end if;

  update public.trip_members
  set display_name = v_name
  where trip_id = p_trip_id
    and user_id = v_target_uid;

  if not found then
    raise exception 'Member not found in this trip';
  end if;
end;
$$;


ALTER FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."trip_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "budget_limit" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    CONSTRAINT "trip_budgets_budget_limit_check" CHECK (("budget_limit" >= (0)::numeric)),
    CONSTRAINT "trip_budgets_currency_len_chk" CHECK (("char_length"("currency") = 3))
);


ALTER TABLE "public"."trip_budgets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text" DEFAULT 'BRL'::"text") RETURNS "public"."trip_budgets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
  v_owner_user_id uuid;
  v_budget public.trip_budgets;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Trip membership not found';
  END IF;

  IF p_budget_limit < 0 THEN
    RAISE EXCEPTION 'Budget limit must be >= 0';
  END IF;

  IF char_length(p_currency) != 3 THEN
    RAISE EXCEPTION 'Currency must be 3 characters (ISO 4217)';
  END IF;

  v_owner_user_id := public.budget_owner_user_id(p_trip_id, v_uid);
  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Budget owner resolution failed';
  END IF;

  INSERT INTO public.trip_budgets (trip_id, owner_user_id, budget_limit, currency)
  VALUES (p_trip_id, v_owner_user_id, p_budget_limit, p_currency)
  ON CONFLICT (trip_id, owner_user_id) DO UPDATE
    SET budget_limit = excluded.budget_limit,
        currency = excluded.currency,
        updated_at = now()
  RETURNING * INTO v_budget;

  RETURN v_budget;
END;
$$;


ALTER FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_member_id" "uuid",
    "description" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    CONSTRAINT "documents_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."expense_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expense_splits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "member_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "percentage" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "expense_splits_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "expense_splits_percentage_check" CHECK ((("percentage" >= (0)::numeric) AND ("percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."expense_splits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "category" "text",
    "date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_member_id" "uuid",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "itinerary_item_id" "uuid",
    "category_id" "uuid",
    "is_confirmed" boolean DEFAULT false NOT NULL,
    "paid_by_member_id" "uuid",
    "split_type" "text" DEFAULT 'equal'::"text",
    CONSTRAINT "expenses_split_type_check" CHECK (("split_type" = ANY (ARRAY['equal'::"text", 'unequal'::"text"]))),
    CONSTRAINT "expenses_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."expenses"."is_confirmed" IS 'Indicates whether the expense is confirmed (true) or predicted/planned (false)';



CREATE TABLE IF NOT EXISTS "public"."idea_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "url" "text" NOT NULL,
    "asset_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "idea_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['attachment'::"text", 'photo'::"text"])))
);


ALTER TABLE "public"."idea_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idea_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "idea_id" "uuid" NOT NULL,
    "label" "text",
    "url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."idea_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ideas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "created_by_member_id" "uuid",
    "title" "text" NOT NULL,
    "maps_url" "text",
    "estimated_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "notes" "text",
    "is_converted" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ideas_currency_len_chk" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "ideas_estimated_amount_check" CHECK (("estimated_amount" >= (0)::numeric)),
    CONSTRAINT "ideas_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."ideas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "start_time" timestamp with time zone,
    "end_time" timestamp with time zone,
    "amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "photo_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_member_id" "uuid",
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "type_id" "uuid",
    "is_all_day" boolean DEFAULT false,
    "is_completed" boolean DEFAULT false,
    CONSTRAINT "itinerary_currency_len_chk" CHECK (("char_length"("currency") = 3)),
    CONSTRAINT "itinerary_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."itinerary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."itinerary_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text" DEFAULT 'Calendar'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."itinerary_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "from_member_id" "uuid" NOT NULL,
    "to_member_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_confirmed" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "settlements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "settlements_check" CHECK (("from_member_id" <> "to_member_id"))
);


ALTER TABLE "public"."settlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "display_name" "text",
    "spouse_member_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "guest_email" "text",
    CONSTRAINT "trip_members_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'member'::"text"]))),
    CONSTRAINT "trip_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'guest'::"text"])))
);


ALTER TABLE "public"."trip_members" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."member_balances" WITH ("security_invoker"='true') AS
 SELECT "tm"."id" AS "member_id",
    "tm"."trip_id",
    "tm"."display_name" AS "member_name",
        CASE
            WHEN (("paid"."total_paid" IS NULL) AND ("owed"."total_owed" IS NULL) AND ("settled"."has_settlements" IS NULL)) THEN (0)::numeric
            ELSE ((COALESCE("paid"."total_paid", (0)::numeric) - COALESCE("owed"."total_owed", (0)::numeric)) + COALESCE("settled"."net_settled", (0)::numeric))
        END AS "net_balance"
   FROM ((("public"."trip_members" "tm"
     LEFT JOIN ( SELECT "e"."paid_by_member_id",
            "sum"("e"."amount") AS "total_paid"
           FROM "public"."expenses" "e"
          WHERE (("e"."is_confirmed" = true) AND ("e"."visibility" = 'public'::"text"))
          GROUP BY "e"."paid_by_member_id") "paid" ON (("paid"."paid_by_member_id" = "tm"."id")))
     LEFT JOIN ( SELECT "es"."member_id",
            "sum"("es"."amount") AS "total_owed"
           FROM ("public"."expense_splits" "es"
             JOIN "public"."expenses" "e" ON (("e"."id" = "es"."expense_id")))
          WHERE (("e"."is_confirmed" = true) AND ("e"."visibility" = 'public'::"text"))
          GROUP BY "es"."member_id") "owed" ON (("owed"."member_id" = "tm"."id")))
     LEFT JOIN ( SELECT "tm2"."id" AS "member_id",
            (COALESCE("paid_out"."total", (0)::numeric) - COALESCE("received"."total", (0)::numeric)) AS "net_settled",
                CASE
                    WHEN (("paid_out"."total" IS NOT NULL) OR ("received"."total" IS NOT NULL)) THEN true
                    ELSE NULL::boolean
                END AS "has_settlements"
           FROM (("public"."trip_members" "tm2"
             LEFT JOIN ( SELECT "settlements"."from_member_id",
                    "sum"("settlements"."amount") AS "total"
                   FROM "public"."settlements"
                  WHERE ("settlements"."is_confirmed" = true)
                  GROUP BY "settlements"."from_member_id") "paid_out" ON (("paid_out"."from_member_id" = "tm2"."id")))
             LEFT JOIN ( SELECT "settlements"."to_member_id",
                    "sum"("settlements"."amount") AS "total"
                   FROM "public"."settlements"
                  WHERE ("settlements"."is_confirmed" = true)
                  GROUP BY "settlements"."to_member_id") "received" ON (("received"."to_member_id" = "tm2"."id")))) "settled" ON (("settled"."member_id" = "tm"."id")));


ALTER VIEW "public"."member_balances" OWNER TO "postgres";


COMMENT ON VIEW "public"."member_balances" IS 'Calculates net balance for each trip member (positive = owed, negative = owes)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "theme_palette" "text" DEFAULT 'default'::"text" NOT NULL,
    "dark_mode" boolean DEFAULT false NOT NULL,
    "default_currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "budget_limit" numeric(12,2) DEFAULT 0 NOT NULL,
    "spouse_user_id" "uuid",
    CONSTRAINT "profiles_default_currency_len_chk" CHECK (("char_length"("default_currency") = 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "token" "text" NOT NULL,
    "invited_by_member_id" "uuid" NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "guest_member_id" "uuid"
);


ALTER TABLE "public"."trip_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trip_settlement_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trip_id" "uuid" NOT NULL,
    "is_settled" boolean DEFAULT false,
    "settled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."trip_settlement_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "destination" "text",
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_user_id" "uuid",
    "theme_palette" "text" DEFAULT 'default'::"text" NOT NULL
);


ALTER TABLE "public"."trips" OWNER TO "postgres";


ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."expense_categories"
    ADD CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_expense_id_member_id_key" UNIQUE ("expense_id", "member_id");



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idea_assets"
    ADD CONSTRAINT "idea_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idea_links"
    ADD CONSTRAINT "idea_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itinerary"
    ADD CONSTRAINT "itinerary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."itinerary_types"
    ADD CONSTRAINT "itinerary_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."itinerary_types"
    ADD CONSTRAINT "itinerary_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_trip_id_owner_user_id_key" UNIQUE ("trip_id", "owner_user_id");



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_settlement_status"
    ADD CONSTRAINT "trip_settlement_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trip_settlement_status"
    ADD CONSTRAINT "trip_settlement_status_trip_id_key" UNIQUE ("trip_id");



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_documents_trip_id" ON "public"."documents" USING "btree" ("trip_id");



CREATE INDEX "idx_expense_splits_expense_id" ON "public"."expense_splits" USING "btree" ("expense_id");



CREATE INDEX "idx_expense_splits_member_id" ON "public"."expense_splits" USING "btree" ("member_id");



CREATE INDEX "idx_expenses_category_id" ON "public"."expenses" USING "btree" ("category_id");



CREATE INDEX "idx_expenses_is_confirmed" ON "public"."expenses" USING "btree" ("is_confirmed");



CREATE INDEX "idx_expenses_itinerary_item_id" ON "public"."expenses" USING "btree" ("itinerary_item_id");



CREATE INDEX "idx_expenses_trip_id" ON "public"."expenses" USING "btree" ("trip_id");



CREATE INDEX "idx_idea_assets_idea_id" ON "public"."idea_assets" USING "btree" ("idea_id");



CREATE INDEX "idx_idea_links_idea_id" ON "public"."idea_links" USING "btree" ("idea_id");



CREATE INDEX "idx_ideas_trip_id" ON "public"."ideas" USING "btree" ("trip_id");



CREATE INDEX "idx_itinerary_all_day" ON "public"."itinerary" USING "btree" ("trip_id", "is_all_day");



CREATE INDEX "idx_itinerary_trip_id" ON "public"."itinerary" USING "btree" ("trip_id");



CREATE INDEX "idx_itinerary_type_id" ON "public"."itinerary" USING "btree" ("type_id");



CREATE INDEX "idx_settlements_from_member" ON "public"."settlements" USING "btree" ("from_member_id");



CREATE INDEX "idx_settlements_to_member" ON "public"."settlements" USING "btree" ("to_member_id");



CREATE INDEX "idx_settlements_trip_id" ON "public"."settlements" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_budgets_owner_user_id" ON "public"."trip_budgets" USING "btree" ("owner_user_id");



CREATE INDEX "idx_trip_budgets_trip_id" ON "public"."trip_budgets" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_invites_trip_id" ON "public"."trip_invites" USING "btree" ("trip_id");



CREATE UNIQUE INDEX "idx_trip_invites_unique_trip_email" ON "public"."trip_invites" USING "btree" ("trip_id", "lower"("email"));



CREATE INDEX "idx_trip_members_trip_id" ON "public"."trip_members" USING "btree" ("trip_id");



CREATE INDEX "idx_trip_members_user_id" ON "public"."trip_members" USING "btree" ("user_id");



CREATE INDEX "idx_trip_settlement_status_trip_id" ON "public"."trip_settlement_status" USING "btree" ("trip_id");



CREATE UNIQUE INDEX "trip_members_trip_user_unique" ON "public"."trip_members" USING "btree" ("trip_id", "user_id") WHERE ("user_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "trigger_create_trip_settlement_status" AFTER INSERT ON "public"."trips" FOR EACH ROW EXECUTE FUNCTION "public"."create_trip_settlement_status"();



CREATE OR REPLACE TRIGGER "trip_budgets_touch_updated_at" BEFORE UPDATE ON "public"."trip_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_splits"
    ADD CONSTRAINT "expense_splits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_itinerary_item_id_fkey" FOREIGN KEY ("itinerary_item_id") REFERENCES "public"."itinerary"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_by_member_id_fkey" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."trip_members"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idea_assets"
    ADD CONSTRAINT "idea_assets_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."idea_links"
    ADD CONSTRAINT "idea_links_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ideas"
    ADD CONSTRAINT "ideas_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary"
    ADD CONSTRAINT "itinerary_created_by_member_id_fkey" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary"
    ADD CONSTRAINT "itinerary_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."itinerary"
    ADD CONSTRAINT "itinerary_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."itinerary_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_spouse_user_id_fkey" FOREIGN KEY ("spouse_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_from_member_id_fkey" FOREIGN KEY ("from_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_to_member_id_fkey" FOREIGN KEY ("to_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_budgets"
    ADD CONSTRAINT "trip_budgets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_guest_member_id_fkey" FOREIGN KEY ("guest_member_id") REFERENCES "public"."trip_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_invited_by_member_id_fkey" FOREIGN KEY ("invited_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_invites"
    ADD CONSTRAINT "trip_invites_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_spouse_member_id_fkey" FOREIGN KEY ("spouse_member_id") REFERENCES "public"."trip_members"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_members"
    ADD CONSTRAINT "trip_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trip_settlement_status"
    ADD CONSTRAINT "trip_settlement_status_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trips"
    ADD CONSTRAINT "trips_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Trip admins can update settlement status" ON "public"."trip_settlement_status" USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "trip_settlement_status"."trip_id") AND ("tm"."user_id" = "auth"."uid"()) AND ("tm"."role" = 'admin'::"text")))));



CREATE POLICY "Users can create expense splits for their expenses" ON "public"."expense_splits" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."expenses" "e"
     JOIN "public"."trip_members" "tm" ON (("e"."created_by_member_id" = "tm"."id")))
  WHERE (("e"."id" = "expense_splits"."expense_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create settlements in their trips" ON "public"."settlements" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "settlements"."trip_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete expense splits for their expenses" ON "public"."expense_splits" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."expenses" "e"
     JOIN "public"."trip_members" "tm" ON (("e"."created_by_member_id" = "tm"."id")))
  WHERE (("e"."id" = "expense_splits"."expense_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete settlements in their trips" ON "public"."settlements" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "settlements"."trip_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update expense splits for their expenses" ON "public"."expense_splits" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."expenses" "e"
     JOIN "public"."trip_members" "tm" ON (("e"."created_by_member_id" = "tm"."id")))
  WHERE (("e"."id" = "expense_splits"."expense_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their settlements" ON "public"."settlements" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."id" = "settlements"."from_member_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view expense splits in their trips" ON "public"."expense_splits" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."expenses" "e"
     JOIN "public"."trip_members" "tm" ON (("e"."trip_id" = "tm"."trip_id")))
  WHERE (("e"."id" = "expense_splits"."expense_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view settlements in their trips" ON "public"."settlements" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "settlements"."trip_id") AND ("tm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view trip settlement status" ON "public"."trip_settlement_status" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trip_members" "tm"
  WHERE (("tm"."trip_id" = "trip_settlement_status"."trip_id") AND ("tm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_delete_owner_or_admin" ON "public"."documents" FOR DELETE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



CREATE POLICY "documents_insert_member" ON "public"."documents" FOR INSERT WITH CHECK (("created_by_member_id" = "public"."current_member_id"("trip_id")));



CREATE POLICY "documents_select_visibility" ON "public"."documents" FOR SELECT USING ("public"."can_view_scoped_data"("trip_id", "created_by_member_id", "visibility"));



CREATE POLICY "documents_update_owner_or_admin" ON "public"."documents" FOR UPDATE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id"))) WITH CHECK ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



ALTER TABLE "public"."expense_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_categories_all_authenticated" ON "public"."expense_categories" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "expense_categories_select_all" ON "public"."expense_categories" FOR SELECT USING (true);



ALTER TABLE "public"."expense_splits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete_owner_or_admin" ON "public"."expenses" FOR DELETE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



CREATE POLICY "expenses_insert_member" ON "public"."expenses" FOR INSERT WITH CHECK (("created_by_member_id" = "public"."current_member_id"("trip_id")));



CREATE POLICY "expenses_select_visibility" ON "public"."expenses" FOR SELECT USING ("public"."can_view_scoped_data"("trip_id", "created_by_member_id", "visibility"));



CREATE POLICY "expenses_update_owner_or_admin" ON "public"."expenses" FOR UPDATE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id"))) WITH CHECK ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



ALTER TABLE "public"."idea_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "idea_assets_delete_owner_or_admin" ON "public"."idea_assets" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_assets"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



CREATE POLICY "idea_assets_insert_owner_or_admin" ON "public"."idea_assets" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_assets"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



CREATE POLICY "idea_assets_select_visibility" ON "public"."idea_assets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_assets"."idea_id") AND "public"."can_view_scoped_data"("i"."trip_id", "i"."created_by_member_id", "i"."visibility")))));



CREATE POLICY "idea_assets_update_owner_or_admin" ON "public"."idea_assets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_assets"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_assets"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



ALTER TABLE "public"."idea_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "idea_links_delete_owner_or_admin" ON "public"."idea_links" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_links"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



CREATE POLICY "idea_links_insert_owner_or_admin" ON "public"."idea_links" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_links"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



CREATE POLICY "idea_links_select_visibility" ON "public"."idea_links" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_links"."idea_id") AND "public"."can_view_scoped_data"("i"."trip_id", "i"."created_by_member_id", "i"."visibility")))));



CREATE POLICY "idea_links_update_owner_or_admin" ON "public"."idea_links" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_links"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ideas" "i"
  WHERE (("i"."id" = "idea_links"."idea_id") AND (("i"."created_by_member_id" = "public"."current_member_id"("i"."trip_id")) OR "public"."is_trip_admin"("i"."trip_id"))))));



ALTER TABLE "public"."ideas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ideas_delete_owner_or_admin" ON "public"."ideas" FOR DELETE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



CREATE POLICY "ideas_insert_member" ON "public"."ideas" FOR INSERT WITH CHECK (("created_by_member_id" = "public"."current_member_id"("trip_id")));



CREATE POLICY "ideas_select_visibility" ON "public"."ideas" FOR SELECT USING ("public"."can_view_scoped_data"("trip_id", "created_by_member_id", "visibility"));



CREATE POLICY "ideas_update_owner_or_admin" ON "public"."ideas" FOR UPDATE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id"))) WITH CHECK ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



ALTER TABLE "public"."itinerary" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itinerary_delete_owner_or_admin" ON "public"."itinerary" FOR DELETE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



CREATE POLICY "itinerary_insert_member" ON "public"."itinerary" FOR INSERT WITH CHECK (("created_by_member_id" = "public"."current_member_id"("trip_id")));



CREATE POLICY "itinerary_select_visibility" ON "public"."itinerary" FOR SELECT USING ("public"."can_view_scoped_data"("trip_id", "created_by_member_id", "visibility"));



ALTER TABLE "public"."itinerary_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "itinerary_types_all_authenticated" ON "public"."itinerary_types" USING (("auth"."role"() = 'authenticated'::"text")) WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "itinerary_types_select_all" ON "public"."itinerary_types" FOR SELECT USING (true);



CREATE POLICY "itinerary_update_owner_or_admin" ON "public"."itinerary" FOR UPDATE USING ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id"))) WITH CHECK ((("created_by_member_id" = "public"."current_member_id"("trip_id")) OR "public"."is_trip_admin"("trip_id")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "profiles_select_trip_member" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."trip_members" "tm1"
     JOIN "public"."trip_members" "tm2" ON (("tm1"."trip_id" = "tm2"."trip_id")))
  WHERE (("tm1"."user_id" = "auth"."uid"()) AND ("tm2"."user_id" = "profiles"."user_id")))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trip_budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_budgets_delete_member" ON "public"."trip_budgets" FOR DELETE USING (("public"."is_trip_member"("trip_id") AND ("owner_user_id" = "public"."budget_owner_user_id"("trip_id", "auth"."uid"()))));



CREATE POLICY "trip_budgets_insert_member" ON "public"."trip_budgets" FOR INSERT WITH CHECK (("public"."is_trip_member"("trip_id") AND ("owner_user_id" = "public"."budget_owner_user_id"("trip_id", "auth"."uid"()))));



CREATE POLICY "trip_budgets_select_member" ON "public"."trip_budgets" FOR SELECT USING (("public"."is_trip_member"("trip_id") AND ("owner_user_id" = "public"."budget_owner_user_id"("trip_id", "auth"."uid"()))));



CREATE POLICY "trip_budgets_update_member" ON "public"."trip_budgets" FOR UPDATE USING (("public"."is_trip_member"("trip_id") AND ("owner_user_id" = "public"."budget_owner_user_id"("trip_id", "auth"."uid"())))) WITH CHECK (("public"."is_trip_member"("trip_id") AND ("owner_user_id" = "public"."budget_owner_user_id"("trip_id", "auth"."uid"()))));



ALTER TABLE "public"."trip_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_invites_delete_admin" ON "public"."trip_invites" FOR DELETE USING ("public"."is_trip_admin"("trip_id"));



CREATE POLICY "trip_invites_select_admin" ON "public"."trip_invites" FOR SELECT USING ("public"."is_trip_admin"("trip_id"));



CREATE POLICY "trip_invites_update_admin" ON "public"."trip_invites" FOR UPDATE USING ("public"."is_trip_admin"("trip_id")) WITH CHECK ("public"."is_trip_admin"("trip_id"));



ALTER TABLE "public"."trip_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trip_members_delete_admin" ON "public"."trip_members" FOR DELETE USING ("public"."is_trip_admin"("trip_id"));



CREATE POLICY "trip_members_select_member" ON "public"."trip_members" FOR SELECT USING ("public"."is_trip_member"("trip_id"));



CREATE POLICY "trip_members_update_admin" ON "public"."trip_members" FOR UPDATE USING ("public"."is_trip_admin"("trip_id")) WITH CHECK ("public"."is_trip_admin"("trip_id"));



ALTER TABLE "public"."trip_settlement_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."trips" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "trips_delete_admin" ON "public"."trips" FOR DELETE USING ("public"."is_trip_admin"("id"));



CREATE POLICY "trips_select_member" ON "public"."trips" FOR SELECT USING ("public"."is_trip_member"("id"));



CREATE POLICY "trips_update_admin" ON "public"."trips" FOR UPDATE USING ("public"."is_trip_admin"("id")) WITH CHECK ("public"."is_trip_admin"("id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."documents";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."expenses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."idea_assets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."idea_links";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ideas";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."itinerary";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."itinerary_types";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trip_budgets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trip_invites";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."trip_members";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."accept_trip_invite"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_trip_invite"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_trip_invite"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_trip_invite"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_guest_member"("p_trip_id" "uuid", "p_name" "text", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_global_spouse"("p_target_user_id" "uuid", "p_spouse_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."budget_owner_user_id"("p_trip_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_owner_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_scoped_data"("p_trip_id" "uuid", "p_owner_member_id" "uuid", "p_visibility" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_trip_invite"("p_trip_id" "uuid", "p_invite_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_destination" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_destination" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip"("p_name" "text", "p_destination" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_invite"("p_trip_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_trip_settlement_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_settlement_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_settlement_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_trip_with_admin"("p_name" "text", "p_destination" "text", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_member_id"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_member_id"("p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."current_member_id"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_member_id"("p_trip_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid", "p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_admin"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_trip_member"("p_trip_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_guest_member"("p_trip_id" "uuid", "p_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_global_spouse"("p_spouse_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_trip_spouse"("p_trip_id" "uuid", "p_member_id" "uuid", "p_spouse_member_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_my_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_my_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_member_display_name"("p_trip_id" "uuid", "p_display_name" "text", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."trip_budgets" TO "anon";
GRANT ALL ON TABLE "public"."trip_budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_budgets" TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_trip_budget"("p_trip_id" "uuid", "p_budget_limit" numeric, "p_currency" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."expense_categories" TO "anon";
GRANT ALL ON TABLE "public"."expense_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_categories" TO "service_role";



GRANT ALL ON TABLE "public"."expense_splits" TO "anon";
GRANT ALL ON TABLE "public"."expense_splits" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_splits" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."idea_assets" TO "anon";
GRANT ALL ON TABLE "public"."idea_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."idea_assets" TO "service_role";



GRANT ALL ON TABLE "public"."idea_links" TO "anon";
GRANT ALL ON TABLE "public"."idea_links" TO "authenticated";
GRANT ALL ON TABLE "public"."idea_links" TO "service_role";



GRANT ALL ON TABLE "public"."ideas" TO "anon";
GRANT ALL ON TABLE "public"."ideas" TO "authenticated";
GRANT ALL ON TABLE "public"."ideas" TO "service_role";



GRANT ALL ON TABLE "public"."itinerary" TO "anon";
GRANT ALL ON TABLE "public"."itinerary" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerary" TO "service_role";



GRANT ALL ON TABLE "public"."itinerary_types" TO "anon";
GRANT ALL ON TABLE "public"."itinerary_types" TO "authenticated";
GRANT ALL ON TABLE "public"."itinerary_types" TO "service_role";



GRANT ALL ON TABLE "public"."settlements" TO "anon";
GRANT ALL ON TABLE "public"."settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."settlements" TO "service_role";



GRANT ALL ON TABLE "public"."trip_members" TO "anon";
GRANT ALL ON TABLE "public"."trip_members" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_members" TO "service_role";



GRANT ALL ON TABLE "public"."member_balances" TO "anon";
GRANT ALL ON TABLE "public"."member_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."member_balances" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."trip_invites" TO "anon";
GRANT ALL ON TABLE "public"."trip_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_invites" TO "service_role";



GRANT ALL ON TABLE "public"."trip_settlement_status" TO "anon";
GRANT ALL ON TABLE "public"."trip_settlement_status" TO "authenticated";
GRANT ALL ON TABLE "public"."trip_settlement_status" TO "service_role";



GRANT ALL ON TABLE "public"."trips" TO "anon";
GRANT ALL ON TABLE "public"."trips" TO "authenticated";
GRANT ALL ON TABLE "public"."trips" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































