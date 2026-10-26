-- The public RPC uses caller permissions. RLS permits reading one's own role only.
grant usage on schema private to authenticated;
grant select on private.album_members to authenticated;
alter table private.album_members enable row level security;
create policy album_member_self on private.album_members for select to authenticated
using (email=lower(coalesce((select auth.jwt())->>'email','')) and (select auth.uid()) is not null);
alter function public.current_album_role() security invoker;
