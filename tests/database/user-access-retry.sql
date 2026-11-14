-- Committed fixtures verify that SQL Editor retries retain actual access data.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000008891','retry-owner@example.test',now()),
 ('00000000-0000-4000-8000-000000008892','retry-staff@example.test',now());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008891',false);
select public.create_shop('Access retry preservation','Asia/Manila');
insert into public.shop_members(shop_id,user_id,role,status,permissions)
 select shop_id,'00000000-0000-4000-8000-000000008892','staff','suspended','{"pos":["view"],"expenses":["view","create"]}'::jsonb
 from public.shop_members where user_id='00000000-0000-4000-8000-000000008891';
select public.manage_shop_user((select shop_id from public.shop_members where user_id='00000000-0000-4000-8000-000000008891'),
 '{"action":"invite","email":"retry-invite@example.test","permissions":{"menu":["view","edit"]}}');
