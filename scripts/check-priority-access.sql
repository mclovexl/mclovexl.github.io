-- Transaction-only fixture; no real story, photo or voucher is changed.
begin;
set local statement_timeout='10s';
select set_config('qa.call_one',gen_random_uuid()::text,true);
select set_config('qa.call_two',gen_random_uuid()::text,true);
select set_config('qa.owner_call',gen_random_uuid()::text,true);
select set_config('qa.owner_id',(select u.id::text from auth.users u join private.album_members m on lower(u.email)=m.email where m.role='owner'),true);
select set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')::text from auth.users u join private.album_members m on lower(u.email)=m.email where m.role='partner'),true);
set local role authenticated;
insert into public.universe_privilege_uses(id,coupon_key,created_by) values(current_setting('qa.call_one')::uuid,'pause',(select auth.uid()));
do $$ declare affected integer; begin
  insert into public.universe_privilege_uses(id,coupon_key,created_by) values(current_setting('qa.call_one')::uuid,'pause',(select auth.uid())) on conflict(id) do nothing;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Retry duplicated a call'; end if;
  begin
    insert into public.universe_privilege_uses(id,coupon_key,created_by) values(gen_random_uuid(),'pause',(select auth.uid()));
    raise exception 'Duplicate pending coupon allowed';
  exception when unique_violation then null;
  end;
  begin
    update public.universe_privilege_uses set status='responded' where id=current_setting('qa.call_one')::uuid;
    raise exception 'Partner forged owner response';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.universe_privilege_uses set created_by=current_setting('qa.owner_id')::uuid where id=current_setting('qa.call_one')::uuid;
    raise exception 'Creator mutable';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.universe_privilege_uses set status='cancelled' where id=current_setting('qa.call_one')::uuid;
insert into public.universe_privilege_uses(id,coupon_key,created_by) values(current_setting('qa.call_two')::uuid,'pause',(select auth.uid()));
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')::text from auth.users u join private.album_members m on lower(u.email)=m.email where m.role='owner'),true);
set local role authenticated;
do $$ declare affected integer; begin
  update public.universe_privilege_uses set status='responded' where id=current_setting('qa.call_two')::uuid and status='pending';
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Owner response failed'; end if;
  if not exists(select 1 from public.universe_privilege_uses where id=current_setting('qa.call_two')::uuid and status='responded' and responded_by=(select auth.uid()) and responded_at=now()) then raise exception 'Server response metadata failed'; end if;
end $$;
insert into public.universe_privilege_uses(id,coupon_key,created_by) values(current_setting('qa.owner_call')::uuid,'listen',(select auth.uid()));
reset role;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',u.id,'email',u.email,'role','authenticated')::text from auth.users u join private.album_members m on lower(u.email)=m.email where m.role='partner'),true);
set local role authenticated;
do $$ declare affected integer; begin
  update public.universe_privilege_uses set status='cancelled' where id=current_setting('qa.owner_call')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Partner cancelled another creator request'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email','outsider@example.invalid','role','authenticated')::text,true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists(select 1 from public.universe_privilege_uses) then raise exception 'Outsider read private requests'; end if;
  begin
    insert into public.universe_privilege_uses(id,coupon_key,created_by) values(gen_random_uuid(),'company',(select auth.uid()));
    raise exception 'Outsider inserted request';
  exception when insufficient_privilege then null;
  end;
  update public.universe_privilege_uses set status='responded' where id=current_setting('qa.owner_call')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Outsider changed private request'; end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.universe_privilege_uses','SELECT') or has_column_privilege('anon','public.universe_privilege_uses','status','UPDATE') then raise exception 'Anonymous privileges exposed'; end if;
  if has_column_privilege('authenticated','public.universe_privilege_uses','responded_at','UPDATE') then raise exception 'Client can forge response time'; end if;
end $$;
select 'PASS: two members, owner responses, own cancellations, retries, duplicate prevention, server metadata, outsider denial. All fixtures rolled back.' as result;
rollback;
