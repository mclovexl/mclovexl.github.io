-- Recoverable photo deletion. Only the uploader can move or restore a photo.
set local lock_timeout = '5s';
alter table public.album_photos add column deleted_at timestamptz;
revoke delete, update on public.album_photos from anon, authenticated;
grant update (deleted_at) on public.album_photos to authenticated;
drop policy album_photos_delete_own on public.album_photos;

alter policy album_photos_read on public.album_photos
using (
  (select public.current_album_role()) is not null
  and (deleted_at is null or created_by = (select auth.uid()))
);
create policy album_photos_update_own on public.album_photos
for update to authenticated
using ((select public.current_album_role()) is not null and created_by = (select auth.uid()))
with check ((select public.current_album_role()) is not null and created_by = (select auth.uid()));

alter policy album_photos_insert on public.album_photos
with check (
  (select public.current_album_role()) is not null
  and created_by = (select auth.uid())
  and deleted_at is null
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'our-universe-private' and o.name = object_path
      and o.owner_id = (select auth.uid())::text
  )
);

-- Keep linked originals recoverable. Failed-upload cleanup may remove orphans.
alter policy album_objects_delete_own on storage.objects
using (
  bucket_id = 'our-universe-private'
  and owner_id = (select auth.uid())::text
  and (select public.current_album_role()) is not null
  and not exists (select 1 from public.album_photos p where p.object_path = storage.objects.name)
);
