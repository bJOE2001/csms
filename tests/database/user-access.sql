-- Exercise the public RPCs with real authenticated roles, RLS and invite tokens.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000008801','owner-access@example.test',now()),
 ('00000000-0000-4000-8000-000000008802','staff-access@example.test',now()),
 ('00000000-0000-4000-8000-000000008803','invited-access@example.test',now()),
 ('00000000-0000-4000-8000-000000008804','other-access@example.test',now());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select set_config('access_test.shop',public.create_shop('Access test','Asia/Manila')::text,true);
insert into public.shop_members(shop_id,user_id,role) values(current_setting('access_test.shop')::uuid,'00000000-0000-4000-8000-000000008802','staff');
create function pg_temp.denied(command text) returns void language plpgsql as $$begin
 begin execute command;exception when insufficient_privilege then return;end;
 raise exception 'Unauthorized operation succeeded: %',command;
end $$;
set local role authenticated;
do $$begin
 assert public.has_shop_permission(current_setting('access_test.shop')::uuid,'users');
 assert public.valid_shop_permissions('{}');
 assert not public.valid_shop_permissions('{"menu":["edit"]}');
 assert not public.valid_shop_permissions('{"users":["view"]}');
 assert not public.valid_shop_permissions('{"pos":["view","delete"]}');
 assert not public.valid_shop_permissions('{"menu":["view","view"]}');
 assert not public.valid_shop_permissions('{"menu":"view"}');
 assert not public.valid_shop_permissions('[]');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008802',true);
do $$begin
 assert public.has_shop_permission(current_setting('access_test.shop')::uuid,'pos','checkout'),'Legacy staff checkout changed';
 assert public.has_shop_permission(current_setting('access_test.shop')::uuid,'sales','export'),'Legacy staff export changed';
 assert not public.has_shop_permission(current_setting('access_test.shop')::uuid,'dashboard');
 assert not public.has_shop_permission(current_setting('access_test.shop')::uuid,'inventory');
end $$;
select pg_temp.denied(format('select public.read_shop_users(%L)',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.manage_shop_user(%L,''{"action":"invite","email":"bad@example.test","permissions":{}}'')',current_setting('access_test.shop')));
reset role;
update public.shop_members set permissions='{}' where user_id='00000000-0000-4000-8000-000000008802';
set local role authenticated;
select pg_temp.denied(format('select public.pos_checkout(%L,''{}'')',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_sales(%L,current_date,current_date)',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_expenses(%L,current_date,current_date)',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_inventory_catalog(%L)',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_inventory_read(%L,current_date,current_date)',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_add_expense(%L,''{}'')',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_save_category(%L,''{}'')',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_refund(%L,%L,''test'')',current_setting('access_test.shop'),'00000000-0000-4000-8000-000000008899'));
do $$begin
 assert (select count(*) from public.pos_products)=0,'Product RLS bypass';
 assert (select count(*) from public.pos_sales)=0,'Sales RLS bypass';
 assert (select count(*) from public.pos_expenses)=0,'Expense RLS bypass';
 assert not has_function_privilege('authenticated','public.pos_save_product_compatibility(uuid,jsonb)','EXECUTE'),'Private product helper exposed';
 assert not has_function_privilege('authenticated','public.pos_checkout_before_offline(uuid,jsonb)','EXECUTE'),'Private checkout helper exposed';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select public.manage_shop_user(current_setting('access_test.shop')::uuid,jsonb_build_object('action','update','id',(select id from public.shop_members where user_id='00000000-0000-4000-8000-000000008802'),'status','active','permissions','{"menu":["view","create"],"inventory":["view","create"]}'::jsonb));
select pg_temp.denied(format('select public.manage_shop_user(%L,%L::jsonb)',current_setting('access_test.shop'),jsonb_build_object('action','update','id',(select id from public.shop_members where user_id='00000000-0000-4000-8000-000000008801'),'status','suspended','permissions','{}'::jsonb)::text));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008802',true);
select public.pos_save_product(current_setting('access_test.shop')::uuid,'{"id":"00000000-0000-4000-8000-000000008810","name":"Access product","price_cents":100,"active":true,"sizes":[]}');
select pg_temp.denied(format('select public.pos_save_product(%L,''{"id":"00000000-0000-4000-8000-000000008810","name":"Changed","price_cents":100,"active":true,"sizes":[]}'')',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_archive_product(%L,''00000000-0000-4000-8000-000000008810'')',current_setting('access_test.shop')));
do $$begin
 assert not public.pos_can_manage_product_image(current_setting('access_test.shop')||'/00000000-0000-4000-8000-000000008810/00000000-0000-4000-8000-000000008819.png'),'Create-only permission allowed an existing product image';
 assert public.pos_can_manage_product_image(current_setting('access_test.shop')||'/00000000-0000-4000-8000-000000008819/00000000-0000-4000-8000-000000008819.png'),'Create permission blocked a new product image';
end $$;
select public.pos_inventory_create_item(current_setting('access_test.shop')::uuid,'{"id":"00000000-0000-4000-8000-000000008811","name":"Access item","base_unit":"each","minimum_stock":"0","item_type":"finished_good","active":true,"notes":""}');
select pg_temp.denied(format('select public.pos_inventory_create_item(%L,''{"id":"00000000-0000-4000-8000-000000008811","name":"Changed","base_unit":"each","minimum_stock":"0","item_type":"finished_good","active":true,"notes":""}'')',current_setting('access_test.shop')));
select pg_temp.denied(format('select public.pos_inventory_post(%L,''{}'')',current_setting('access_test.shop')));
select public.pos_inventory_read(current_setting('access_test.shop')::uuid,current_date,current_date);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select set_config('access_test.token',(public.manage_shop_user(current_setting('access_test.shop')::uuid,'{"action":"invite","email":"invited-access@example.test","permissions":{"expenses":["view","create"]}}')->>'token'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008804',true);
select pg_temp.denied(format('select public.accept_membership_invite(%L)',current_setting('access_test.token')));
do $$begin
 assert public.resolve_shop_access() is null,'Uninvited user should not bootstrap a second shop or membership';
 assert not exists(select 1 from public.shop_members where user_id='00000000-0000-4000-8000-000000008804'),'Uninvited user gained shop membership';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008803',true);
do $$begin
 assert public.resolve_shop_access()=current_setting('access_test.shop')::uuid,'Pending invitation was not accepted automatically on sign-in';
end $$;
select public.accept_membership_invite(current_setting('access_test.token')::uuid);
do $$begin
 assert public.has_shop_permission(current_setting('access_test.shop')::uuid,'expenses','create'),'Invite lost grants';
 assert not public.has_shop_permission(current_setting('access_test.shop')::uuid,'expenses','edit'),'Invite gained edit';
 assert not public.has_shop_permission(current_setting('access_test.shop')::uuid,'pos'),'Invite inherited legacy defaults';
 assert not public.has_shop_permission('00000000-0000-4000-8000-000000008899','expenses'),'Cross-shop grant leak';
end $$;
select public.pos_add_expense(current_setting('access_test.shop')::uuid,'{"id":"00000000-0000-4000-8000-000000008812","spent_on":"2026-11-14","description":"Allowed expense","amount_cents":100}');
select pg_temp.denied(format('select public.pos_void_expense(%L,''00000000-0000-4000-8000-000000008812'')',current_setting('access_test.shop')));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select public.manage_shop_user(current_setting('access_test.shop')::uuid,jsonb_build_object('action','update','id',(select id from public.shop_members where user_id='00000000-0000-4000-8000-000000008803'),'status','suspended','permissions','{"expenses":["view","create"]}'::jsonb));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008803',true);
do $$begin assert not public.has_shop_permission(current_setting('access_test.shop')::uuid,'expenses');end $$;
select pg_temp.denied(format('select public.pos_expenses(%L,current_date,current_date)',current_setting('access_test.shop')));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008801',true);
select set_config('access_test.delete_token',(public.manage_shop_user(current_setting('access_test.shop')::uuid,'{"action":"invite","email":"other-access@example.test","permissions":{"pos":["view"]}}')->>'token'),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008804',true);
select public.accept_membership_invite(current_setting('access_test.delete_token')::uuid);
reset role;
select set_config('request.jwt.claim.sub','',true);
delete from auth.users where id='00000000-0000-4000-8000-000000008804';
do $$begin
 assert not exists(select 1 from public.shop_members where user_id='00000000-0000-4000-8000-000000008804'),'Deleted auth user retained membership';
 assert exists(select 1 from public.membership_invites where email='other-access@example.test' and status='accepted' and accepted_by is null),'Deleted auth user kept accepted_by reference';
 assert exists(select 1 from public.audit_logs where shop_id=current_setting('access_test.shop')::uuid and action='membership.invitation_accepted' and entity_id='00000000-0000-4000-8000-000000008804' and actor_id is null),'Audit log lost or retained actor_id after auth user deletion';
 begin
  update public.audit_logs set action='tampered' where shop_id=current_setting('access_test.shop')::uuid;
  raise exception 'Manual audit update succeeded unexpectedly';
 exception when sqlstate '55000' then null;
 end;
end $$;
rollback;
select 'User access, action grants, direct RPC denial, RLS, owner protection, invitations and suspension passed.';
