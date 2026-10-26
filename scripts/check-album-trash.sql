-- Run with the Supabase SQL tool as the database administrator.
-- All photo changes are rolled back. No auth users or album members are created.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
select set_config('album.qa_owner_claims', jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')::text,true)
from auth.users u join private.album_members m on m.email=lower(u.email) where m.role='owner';
select set_config('request.jwt.claims',current_setting('album.qa_owner_claims'),true);
set local role authenticated;
select set_config('album.qa_photo',id::text,true) from public.album_photos
where created_by=(select auth.uid()) and deleted_at is null order by created_at limit 1;
do $$
declare photo uuid := current_setting('album.qa_photo')::uuid; changed integer;
begin
  if has_table_privilege('authenticated','public.album_photos','DELETE') then raise exception 'Hard deletion must be disabled'; end if;
  if not has_column_privilege('authenticated','public.album_photos','deleted_at','UPDATE') then raise exception 'Missing trash update grant'; end if;
  if has_column_privilege('authenticated','public.album_photos','created_by','UPDATE') then raise exception 'Ownership must be immutable'; end if;
  if has_column_privilege('authenticated','public.album_photos','title','UPDATE') then raise exception 'Unexpected metadata update grant'; end if;
  update public.album_photos set deleted_at=now() where id=photo and deleted_at is null;
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'Owner trash failed'; end if;
  if not exists(select 1 from public.album_photos where id=photo and deleted_at is not null) then raise exception 'Owner cannot list own trash'; end if;
end $$;
-- Model a different member subject, without creating an account or access grant.
select set_config('request.jwt.claims',jsonb_set(current_setting('album.qa_owner_claims')::jsonb,'{sub}',to_jsonb(gen_random_uuid()::text))::text,true);
do $$
declare photo uuid := current_setting('album.qa_photo')::uuid; changed integer;
begin
  if exists(select 1 from public.album_photos where id=photo) then raise exception 'Other uploader can list private trash'; end if;
  update public.album_photos set deleted_at=null where id=photo;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Other uploader can restore photo'; end if;
end $$;
select set_config('request.jwt.claims',current_setting('album.qa_owner_claims'),true);
do $$
declare photo uuid := current_setting('album.qa_photo')::uuid; changed integer;
begin
  update public.album_photos set deleted_at=null where id=photo and deleted_at is not null;
  get diagnostics changed = row_count;
  if changed<>1 then raise exception 'Owner restore failed'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_set(current_setting('album.qa_owner_claims')::jsonb,'{sub}',to_jsonb(gen_random_uuid()::text))::text,true);
do $$
declare changed integer;
begin
  update public.album_photos set deleted_at=now() where id=current_setting('album.qa_photo')::uuid;
  get diagnostics changed = row_count;
  if changed<>0 then raise exception 'Other uploader can trash active photo'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email','not-a-member@example.invalid','role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.album_photos) then raise exception 'Nonmember can read album'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.album_photos','SELECT') or has_table_privilege('anon','public.album_photos','UPDATE') then raise exception 'Anonymous access granted'; end if;
end $$;
rollback;
select 'PASS: owner trash/restore, other subject denied, nonmember denied, limited grants; all changes rolled back' as result,
  (select count(*) from public.album_photos) as photo_rows,
  (select count(*) from public.album_photos where deleted_at is not null) as trash_rows,
  (select count(*) from storage.objects where bucket_id='our-universe-private') as stored_originals;
