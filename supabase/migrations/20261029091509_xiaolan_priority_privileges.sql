create table public.universe_privilege_uses (
  id uuid primary key,
  coupon_key text not null check (coupon_key in ('pause','listen','company')),
  status text not null default 'pending' check (status in ('pending','responded','cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  constraint privilege_response_metadata check (
    (status='responded' and responded_by is not null and responded_at is not null) or
    (status in ('pending','cancelled') and responded_by is null and responded_at is null)
  )
);
create unique index universe_privilege_one_pending_idx on public.universe_privilege_uses(coupon_key) where status='pending';
create index universe_privilege_recent_idx on public.universe_privilege_uses(created_at desc,id desc) where status='responded';
create index universe_privilege_creator_idx on public.universe_privilege_uses(created_by);
create index universe_privilege_responder_idx on public.universe_privilege_uses(responded_by);
alter table public.universe_privilege_uses enable row level security;
revoke all on public.universe_privilege_uses from public,anon,authenticated;
grant select on public.universe_privilege_uses to authenticated;
grant insert (id,coupon_key,created_by) on public.universe_privilege_uses to authenticated;
grant update (status) on public.universe_privilege_uses to authenticated;

create policy universe_privilege_read on public.universe_privilege_uses for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_privilege_create on public.universe_privilege_uses for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by=(select auth.uid()) and status='pending');
create policy universe_privilege_respond on public.universe_privilege_uses for update to authenticated
using ((select public.current_album_role())='owner' and status='pending')
with check ((select public.current_album_role())='owner' and status='responded' and responded_by=(select auth.uid()));
create policy universe_privilege_cancel on public.universe_privilege_uses for update to authenticated
using ((select public.current_album_role()) is not null and created_by=(select auth.uid()) and status='pending')
with check ((select public.current_album_role()) is not null and created_by=(select auth.uid()) and status='cancelled');

-- Response identity and time come from Postgres, never from the browser.
create function private.finish_privilege_use()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status<>'pending' or new.status not in ('responded','cancelled') then
    raise exception 'Privilege request already resolved';
  end if;
  if new.status='responded' then
    new.responded_by=(select auth.uid());
    new.responded_at=now();
  else
    new.responded_by=null;
    new.responded_at=null;
  end if;
  return new;
end;
$$;
revoke all on function private.finish_privilege_use() from public,anon,authenticated;
create trigger finish_privilege_use before update on public.universe_privilege_uses
for each row execute function private.finish_privilege_use();
