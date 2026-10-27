-- Only untouched seed wishes may inherit an old device's status.
alter table public.universe_wishes add column source text not null default 'seed'
  check (source in ('seed','legacy','edit'));
grant update (source) on public.universe_wishes to authenticated;
