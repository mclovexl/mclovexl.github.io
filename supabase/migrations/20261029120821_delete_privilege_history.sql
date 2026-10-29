-- Both existing album members may remove redeemed history, not pending calls.
grant delete on public.universe_privilege_uses to authenticated;
create policy universe_privilege_delete_history on public.universe_privilege_uses
for delete to authenticated
using ((select public.current_album_role()) is not null and status='responded');
