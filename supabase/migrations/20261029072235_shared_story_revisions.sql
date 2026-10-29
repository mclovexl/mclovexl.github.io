-- Keep optimistic concurrency filters short even for a 2000-character story.
alter table public.universe_stories
  add column revision uuid not null default gen_random_uuid();
grant update (revision) on public.universe_stories to authenticated;
