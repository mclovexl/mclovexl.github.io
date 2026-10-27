-- A seeded default can be replaced by an existing browser letter, but a
-- letter deliberately edited by either member is never overwritten.
alter table public.universe_letter add column source text not null default 'seed'
  check (source in ('seed','legacy','edit'));
grant update (source) on public.universe_letter to authenticated;

create index universe_stories_created_by_idx on public.universe_stories(created_by);
create index universe_wishes_created_by_idx on public.universe_wishes(created_by);
create index universe_wishes_updated_by_idx on public.universe_wishes(updated_by);
create index universe_letter_updated_by_idx on public.universe_letter(updated_by);
create index universe_letter_history_created_by_idx on public.universe_letter_history(created_by);
create index universe_legacy_backups_created_by_idx on public.universe_legacy_backups(created_by);
