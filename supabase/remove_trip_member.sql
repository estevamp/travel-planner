-- Allow trip admins to remove another passenger while preserving records they authored.
CREATE OR REPLACE FUNCTION public.remove_trip_member(p_trip_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_actor_member_id uuid;
  v_target_role text;
BEGIN
  v_actor_id := auth.uid();

  SELECT id INTO v_actor_member_id
  FROM public.trip_members
  WHERE trip_id = p_trip_id AND user_id = v_actor_id AND role = 'admin';

  IF v_actor_member_id IS NULL THEN
    RAISE EXCEPTION 'Only a trip admin can remove passengers';
  END IF;
  IF p_member_id = v_actor_member_id THEN
    RAISE EXCEPTION 'Admins cannot remove themselves';
  END IF;

  SELECT role INTO v_target_role
  FROM public.trip_members
  WHERE id = p_member_id AND trip_id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Passenger not found in this trip';
  END IF;
  IF v_target_role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND role = 'admin' AND id <> p_member_id
  ) THEN
    RAISE EXCEPTION 'The last trip admin cannot be removed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.expense_splits WHERE member_id = p_member_id)
     OR EXISTS (SELECT 1 FROM public.settlements WHERE from_member_id = p_member_id OR to_member_id = p_member_id) THEN
    RAISE EXCEPTION 'Passenger has expense splits or payments linked to them';
  END IF;

  UPDATE public.itinerary SET created_by_member_id = v_actor_member_id
  WHERE trip_id = p_trip_id AND created_by_member_id = p_member_id;
  UPDATE public.expenses SET created_by_member_id = v_actor_member_id, paid_by_member_id = CASE WHEN paid_by_member_id = p_member_id THEN v_actor_member_id ELSE paid_by_member_id END
  WHERE trip_id = p_trip_id AND (created_by_member_id = p_member_id OR paid_by_member_id = p_member_id);
  UPDATE public.documents SET created_by_member_id = v_actor_member_id
  WHERE trip_id = p_trip_id AND created_by_member_id = p_member_id;
  UPDATE public.ideas SET created_by_member_id = v_actor_member_id
  WHERE trip_id = p_trip_id AND created_by_member_id = p_member_id;

  DELETE FROM public.trip_members WHERE id = p_member_id AND trip_id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_trip_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_trip_member(uuid, uuid) TO authenticated;
