-- Migration to fix RLS policies for ideas bucket
-- The previous policies expected 'ideas' as the first part of the path, 
-- but the standard for the bucket is {trip_id}/{member_id}/...

drop policy if exists ideas_bucket_select on storage.objects;
drop policy if exists ideas_bucket_insert on storage.objects;
drop policy if exists ideas_bucket_update on storage.objects;
drop policy if exists ideas_bucket_delete on storage.objects;

create policy ideas_bucket_select on storage.objects
for select using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'ideas'
  and split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  and exists (
    select 1
    from public.idea_assets ia
    join public.ideas i on i.id = ia.idea_id
    where ia.url = name
      and i.id::text = split_part(name, '/', 4)
      and public.can_view_scoped_data(i.trip_id, i.created_by_member_id, i.visibility)
  )
);

create policy ideas_bucket_insert on storage.objects
for insert with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'ideas'
  and split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
  and exists (
    select 1
    from public.ideas i
    where i.id::text = split_part(name, '/', 4)
      and i.trip_id::text = split_part(name, '/', 1)
      and (
        i.created_by_member_id = public.current_member_id(i.trip_id)
        or public.is_trip_admin(i.trip_id)
      )
  )
);

create policy ideas_bucket_update on storage.objects
for update using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'ideas'
  and split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
)
with check (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'ideas'
  and split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
);

create policy ideas_bucket_delete on storage.objects
for delete using (
  bucket_id = 'travel-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
  and split_part(name, '/', 3) = 'ideas'
  and split_part(name, '/', 4) ~* '^[0-9a-f-]{36}$'
  and public.current_member_id(split_part(name, '/', 1)::uuid) = split_part(name, '/', 2)::uuid
  and exists (
    select 1
    from public.ideas i
    where i.id::text = split_part(name, '/', 4)
      and i.trip_id::text = split_part(name, '/', 1)
      and (
        i.created_by_member_id = public.current_member_id(i.trip_id)
        or public.is_trip_admin(i.trip_id)
      )
  )
);
