-- Shared memories use the existing two-person album membership.
create table public.universe_stories (
  id uuid primary key,
  story_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.universe_wishes (
  id text primary key check (id ~ '^[a-zA-Z0-9-]{1,80}$'),
  wish_text text not null check (char_length(btrim(wish_text)) between 1 and 40),
  done boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.universe_letter (
  id text primary key default 'shared' check (id = 'shared'),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  revision uuid not null default gen_random_uuid(),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);

create table public.universe_letter_history (
  id text primary key check (id ~ '^[a-zA-Z0-9-]{1,80}$'),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  source text not null check (source in ('edit', 'legacy')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

-- Immutable backups retain the original browser data even if two devices
-- have conflicting versions. They are private to the same two members.
create table public.universe_legacy_backups (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create index universe_stories_date_id_idx on public.universe_stories(story_date, id);
create index universe_letter_history_created_id_idx on public.universe_letter_history(created_at desc, id desc);

alter table public.universe_stories enable row level security;
alter table public.universe_wishes enable row level security;
alter table public.universe_letter enable row level security;
alter table public.universe_letter_history enable row level security;
alter table public.universe_legacy_backups enable row level security;

revoke all on public.universe_stories, public.universe_wishes, public.universe_letter,
  public.universe_letter_history, public.universe_legacy_backups from public, anon, authenticated;
grant select, insert on public.universe_stories, public.universe_wishes, public.universe_letter,
  public.universe_letter_history, public.universe_legacy_backups to authenticated;
grant update (done, updated_by, updated_at) on public.universe_wishes to authenticated;
grant update (body, revision, updated_by, updated_at) on public.universe_letter to authenticated;

create policy universe_stories_read on public.universe_stories for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_stories_insert on public.universe_stories for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by = (select auth.uid()));

create policy universe_wishes_read on public.universe_wishes for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_wishes_insert on public.universe_wishes for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy universe_wishes_update on public.universe_wishes for update to authenticated
using ((select public.current_album_role()) is not null)
with check ((select public.current_album_role()) is not null and updated_by = (select auth.uid()));

create policy universe_letter_read on public.universe_letter for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_letter_insert on public.universe_letter for insert to authenticated
with check ((select public.current_album_role()) is not null and updated_by = (select auth.uid()));
create policy universe_letter_update on public.universe_letter for update to authenticated
using ((select public.current_album_role()) is not null)
with check ((select public.current_album_role()) is not null and updated_by = (select auth.uid()));

create policy universe_letter_history_read on public.universe_letter_history for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_letter_history_insert on public.universe_letter_history for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by = (select auth.uid()));

create policy universe_legacy_backups_read on public.universe_legacy_backups for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_legacy_backups_insert on public.universe_legacy_backups for insert to authenticated
with check ((select public.current_album_role()) is not null and created_by = (select auth.uid()));
