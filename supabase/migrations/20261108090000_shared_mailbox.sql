-- Additional envelopes and replies reuse the existing two-member access model.
-- The original fixed letter remains in universe_letter, without being copied.
create table public.universe_mail_letters (
  id uuid primary key,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) >= 1),
  created_by uuid not null default auth.uid() references auth.users(id),
  author_role text not null default public.current_album_role() check (author_role in ('owner','partner')),
  created_at timestamptz not null default now()
);

create table public.universe_mail_replies (
  id uuid primary key,
  letter_id uuid references public.universe_mail_letters(id) on delete cascade,
  is_original boolean not null default false,
  body text not null check (char_length(btrim(body)) >= 1),
  created_by uuid not null default auth.uid() references auth.users(id),
  author_role text not null default public.current_album_role() check (author_role in ('owner','partner')),
  created_at timestamptz not null default now(),
  constraint universe_mail_reply_target check (
    (is_original and letter_id is null) or (not is_original and letter_id is not null)
  )
);
create index universe_mail_letters_author_idx on public.universe_mail_letters(created_by);
create index universe_mail_replies_author_idx on public.universe_mail_replies(created_by);
create index universe_mail_replies_thread_idx on public.universe_mail_replies(letter_id,created_at,id);

create function public.stamp_universe_mail_entry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.created_by := auth.uid();
  new.author_role := public.current_album_role();
  new.created_at := clock_timestamp();
  return new;
end;
$$;
create trigger universe_mail_letter_stamp before insert on public.universe_mail_letters
  for each row execute function public.stamp_universe_mail_entry();
create trigger universe_mail_reply_stamp before insert on public.universe_mail_replies
  for each row execute function public.stamp_universe_mail_entry();

alter table public.universe_mail_letters enable row level security;
alter table public.universe_mail_replies enable row level security;
revoke all on public.universe_mail_letters,public.universe_mail_replies from public,anon,authenticated;
grant select,insert on public.universe_mail_letters,public.universe_mail_replies to authenticated;
revoke all on function public.stamp_universe_mail_entry() from public,anon,authenticated;
create policy universe_mail_letters_read on public.universe_mail_letters for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_mail_letters_insert on public.universe_mail_letters for insert to authenticated
with check ((select public.current_album_role()) is not null
  and created_by=(select auth.uid()) and author_role=(select public.current_album_role()));
create policy universe_mail_replies_read on public.universe_mail_replies for select to authenticated
using ((select public.current_album_role()) is not null);
create policy universe_mail_replies_insert on public.universe_mail_replies for insert to authenticated
with check ((select public.current_album_role()) is not null
  and created_by=(select auth.uid()) and author_role=(select public.current_album_role()));
