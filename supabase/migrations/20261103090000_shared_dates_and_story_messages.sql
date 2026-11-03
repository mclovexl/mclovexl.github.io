-- Date boxes and story messages share the existing, verified two-person album
-- membership. This migration adds tables without changing existing memories.
create table public.universe_date_ideas (
  id text primary key check (id ~ '^[a-zA-Z0-9-]{1,80}$'),
  title text not null check (char_length(btrim(title)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 600),
  tag text not null check (char_length(btrim(tag)) between 1 and 30),
  icon text not null check (icon in ('☀','☾','↗','⛰','✧','♡','∞','♫','🎁','✦')),
  revision uuid not null default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.universe_story_messages (
  id uuid primary key,
  story_id uuid references public.universe_stories(id) on delete cascade,
  is_origin boolean not null default false,
  body text not null check (char_length(btrim(body)) >= 1),
  created_by uuid not null default auth.uid() references auth.users(id),
  author_role text not null default public.current_album_role() check (author_role in ('owner','partner')),
  created_at timestamptz not null default now(),
  constraint universe_message_story_target check (
    (is_origin and story_id is null) or (not is_origin and story_id is not null)
  )
);

create index universe_story_messages_story_created_idx
  on public.universe_story_messages(story_id,created_at,id);
create index universe_story_messages_author_idx on public.universe_story_messages(created_by);
create index universe_date_ideas_author_idx on public.universe_date_ideas(created_by);
create index universe_date_ideas_updated_by_idx on public.universe_date_ideas(updated_by);

create function public.stamp_universe_date_idea()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := clock_timestamp();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.revision := gen_random_uuid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger universe_date_idea_stamp before insert or update
  on public.universe_date_ideas for each row execute function public.stamp_universe_date_idea();

create function public.stamp_universe_story_message()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.author_role := public.current_album_role();
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger universe_story_message_stamp before insert
  on public.universe_story_messages for each row execute function public.stamp_universe_story_message();

alter table public.universe_date_ideas enable row level security;
alter table public.universe_story_messages enable row level security;
revoke all on public.universe_date_ideas,public.universe_story_messages from public,anon,authenticated;
grant select,insert on public.universe_date_ideas,public.universe_story_messages to authenticated;
grant update (title,body,tag,icon,revision) on public.universe_date_ideas to authenticated;
revoke all on function public.stamp_universe_date_idea(),public.stamp_universe_story_message() from public,anon,authenticated;

create policy universe_date_ideas_read on public.universe_date_ideas for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_date_ideas_insert on public.universe_date_ideas for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by=(select auth.uid()) and updated_by=(select auth.uid()));
create policy universe_date_ideas_update on public.universe_date_ideas for update to authenticated
using ((select public.current_album_role()) is not null)
with check ((select public.current_album_role()) is not null and updated_by=(select auth.uid()));

create policy universe_story_messages_read on public.universe_story_messages for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_story_messages_insert on public.universe_story_messages for insert to authenticated
with check ((select public.current_album_role()) is not null
  and created_by=(select auth.uid()) and author_role=(select public.current_album_role()));
