create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.album_members (
  email text primary key check (email = lower(btrim(email)) and position('@' in email) > 1),
  role text not null unique check (role in ('owner', 'partner')),
  added_at timestamptz not null default now()
);
revoke all on private.album_members from public, anon, authenticated;

create function public.current_album_role()
returns text language sql stable security definer set search_path = '' as $$
  select m.role from private.album_members m
  where m.email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and (select auth.uid()) is not null;
$$;
revoke all on function public.current_album_role() from public, anon;
grant execute on function public.current_album_role() to authenticated;

create table public.album_photos (
  id uuid primary key,
  album_id text not null default 'our-universe' check (album_id = 'our-universe'),
  object_path text not null unique,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  category text not null check (category in ('日常可爱','一起出发','心动限定')),
  photo_date date,
  byte_count integer not null check (byte_count between 1 and 10485760),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint album_photo_path check (object_path = 'our-universe/' || id::text || '.jpg')
);
create index album_photos_created_at_idx on public.album_photos(created_at desc);
create index album_photos_created_by_idx on public.album_photos(created_by);
alter table public.album_photos enable row level security;
revoke all on public.album_photos from anon, authenticated;
grant select, insert, delete on public.album_photos to authenticated;

create policy album_photos_read on public.album_photos for select to authenticated
using ((select public.current_album_role()) is not null);
create policy album_photos_insert on public.album_photos for insert to authenticated
with check (
  (select public.current_album_role()) is not null
  and created_by = (select auth.uid())
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'our-universe-private' and o.name = object_path
      and o.owner_id = (select auth.uid())::text
  )
);
create policy album_photos_delete_own on public.album_photos for delete to authenticated
using ((select public.current_album_role()) is not null and created_by = (select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('our-universe-private','our-universe-private',false,10485760,array['image/jpeg']);

create policy album_objects_read on storage.objects for select to authenticated
using (bucket_id='our-universe-private' and (storage.foldername(name))[1]='our-universe'
  and (select public.current_album_role()) is not null);
create policy album_objects_insert on storage.objects for insert to authenticated
with check (bucket_id='our-universe-private' and (storage.foldername(name))[1]='our-universe'
  and name ~ '^our-universe/[0-9a-f-]{36}\.jpg$'
  and (select public.current_album_role()) is not null);
create policy album_objects_delete_own on storage.objects for delete to authenticated
using (bucket_id='our-universe-private' and owner_id=(select auth.uid())::text
  and (select public.current_album_role()) is not null);

create table private.album_invitations (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  email text not null references private.album_members(email),
  expires_at timestamptz not null,
  claim_id uuid,
  claimed_at timestamptz,
  consumed_at timestamptz,
  user_id uuid
);
revoke all on private.album_invitations from public, anon, authenticated;

create function public.album_invite_inspect(p_token_hash text)
returns table(email text) language sql stable security definer set search_path='' as $$
  select i.email from private.album_invitations i
  join private.album_members m using(email)
  where i.token_hash=p_token_hash and i.consumed_at is null and i.expires_at>now();
$$;
create function public.album_invite_claim(p_token_hash text)
returns table(email text,claim_id uuid) language sql security definer set search_path='' as $$
  update private.album_invitations i set claim_id=gen_random_uuid(),claimed_at=now()
  where i.token_hash=p_token_hash and i.consumed_at is null and i.expires_at>now()
    and (i.claimed_at is null or i.claimed_at<now()-interval '2 minutes')
    and exists(select 1 from private.album_members m where m.email=i.email)
  returning i.email,i.claim_id;
$$;
create function public.album_invite_finish(p_token_hash text,p_claim_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update private.album_invitations set consumed_at=now(),user_id=p_user_id
  where token_hash=p_token_hash and claim_id=p_claim_id and consumed_at is null;
  return found;
end;
$$;
create function public.album_invite_release(p_token_hash text,p_claim_id uuid)
returns void language sql security definer set search_path='' as $$
  update private.album_invitations set claim_id=null,claimed_at=null
  where token_hash=p_token_hash and claim_id=p_claim_id and consumed_at is null;
$$;
revoke all on function public.album_invite_inspect(text) from public,anon,authenticated;
revoke all on function public.album_invite_claim(text) from public,anon,authenticated;
revoke all on function public.album_invite_finish(text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.album_invite_release(text,uuid) from public,anon,authenticated;
grant execute on function public.album_invite_inspect(text) to service_role;
grant execute on function public.album_invite_claim(text) to service_role;
grant execute on function public.album_invite_finish(text,uuid,uuid) to service_role;
grant execute on function public.album_invite_release(text,uuid) to service_role;
