-- Only the existing two album members can edit story content. Keep IDs,
-- authorship and creation dates immutable to authenticated clients.
grant update (story_date, title, body) on public.universe_stories to authenticated;

create policy universe_stories_update on public.universe_stories
for update to authenticated
using ((select public.current_album_role()) is not null)
with check ((select public.current_album_role()) is not null);
