-- Run after all migrations, including the recipe-only selling policy.
-- The whole fixture is discarded; production and existing test receipts stay intact.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000009500','offline-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000009501','offline-cashier@example.invalid'),
 ('00000000-0000-4000-8000-000000009502','offline-unrelated@example.invalid');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009500',false);
select set_config('test.offline_shop',public.create_shop('Offline checkout test','Asia/Manila')::text,false);
insert into public.shop_members(shop_id,user_id,role)
 values(current_setting('test.offline_shop')::uuid,'00000000-0000-4000-8000-000000009501','staff');
create function pg_temp.expect_offline_error(command text,expected text) returns void language plpgsql as $$
begin
 begin execute command;
 exception when others then
  if position(expected in sqlerrm)=0 then raise exception 'Expected %, got %',expected,sqlerrm;end if;
  return;
 end;
 raise exception 'Expected failure: %',expected;
end $$;
set role authenticated;
do $$
declare shop uuid:=current_setting('test.offline_shop')::uuid;
 item uuid:='00000000-0000-4000-8000-000000009503'; product uuid:='00000000-0000-4000-8000-000000009504';
 sale jsonb; recipe jsonb; result jsonb; captured timestamptz; changed jsonb;
begin
 assert not has_function_privilege('authenticated','public.pos_checkout_before_offline(uuid,jsonb)','execute'),'Timestamp helper exposed';
 assert not has_function_privilege('anon','public.pos_checkout(uuid,jsonb)','execute'),'Anonymous checkout exposed';
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',item,'name','Offline brownie stock','base_unit','each','item_type','finished_good','minimum_stock',0,'active',true));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','opening','quantity','3','purchase_unit','each','total_cost_cents',300,'occurred_on',current_date,'reason','Offline test stock'));
 perform public.pos_save_product(shop,jsonb_build_object('id',product,'name','Offline brownie','price_cents',500,'active',true));
 recipe:=jsonb_build_object('operation_id',gen_random_uuid(),'product_id',product,'action','draft','mode','finished_good','expected_revision',0,'components',jsonb_build_array(jsonb_build_object('ingredient_id',item,'quantity','1')));
 perform public.pos_inventory_recipe(shop,recipe);
 perform public.pos_inventory_recipe(shop,recipe||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',1));
 sale:=jsonb_build_object('id','00000000-0000-4000-8000-000000009505','method','cash','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1,'price_cents',500)));
 -- Existing online clients and their exact-request retries keep working.
 perform public.pos_checkout(shop,sale);perform public.pos_checkout(shop,sale);
 assert (select created_at=received_at from public.pos_sales where id=(sale->>'id')::uuid),'Legacy online date changed';
 -- An offline sale belongs to its capture day, even when uploaded the next day.
 captured:=now()-interval '1 day';
 sale:=sale||jsonb_build_object('id','00000000-0000-4000-8000-000000009506','captured_at',to_char(captured at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 result:=public.pos_checkout(shop,sale);
 assert (result->>'total_cents')::bigint=500;
 assert (select created_at=captured and received_at=now() and received_at>created_at from public.pos_sales where id=(sale->>'id')::uuid),'Capture/receive dates lost';
 assert exists(select 1 from jsonb_array_elements(public.pos_sales(shop,(captured at time zone 'Asia/Manila')::date,(captured at time zone 'Asia/Manila')::date)) row where row->>'id'=sale->>'id'),'Offline sale missing from original business date';
 perform public.pos_checkout(shop,sale);
 assert (select quantity from public.inventory_balances where ingredient_id=item)=1,'Timestamp retry consumed stock twice';
 assert (select count(*) from public.pos_sale_consumptions where sale_id=(sale->>'id')::uuid)=1,'Duplicate timestamp consumption';
 changed:=sale||jsonb_build_object('captured_at',to_char((captured-interval '1 hour') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Sale ID already used for a different sale');
 -- Validation conflicts must preserve the original server stock and sale ledger.
 changed:=sale||jsonb_build_object('id',gen_random_uuid(),'captured_at',to_char((now()+interval '6 minutes') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Sale capture time must be within');
 changed:=changed||jsonb_build_object('captured_at',to_char((now()-interval '31 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Sale capture time must be within');
 changed:=changed||jsonb_build_object('captured_at','tomorrow');
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Invalid sale capture time');
 changed:=changed||jsonb_build_object('captured_at',null);
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Invalid sale capture time');
 changed:=jsonb_set(sale||jsonb_build_object('id',gen_random_uuid()),'{items,0,price_cents}','501');
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'A price changed');
 changed:=jsonb_set(sale||jsonb_build_object('id',gen_random_uuid()),'{items,0,quantity}','2');
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,changed),'Insufficient stock');
 assert (select count(*) from public.pos_sales where shop_id=shop)=2,'Failed upload committed a receipt';
 assert (select quantity from public.inventory_balances where ingredient_id=item)=1,'Failed upload consumed stock';
 perform set_config('test.offline_payload',sale::text,false);
end $$;
-- Simulate a receipt accepted more than 30 days ago to exercise a late retry.
-- The original receive time and recorded inventory consumption remain intact.
reset role;
update public.pos_sales set
 request=request||jsonb_build_object('captured_at',to_char((now()-interval '31 days') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
 created_at=now()-interval '31 days'
 where id='00000000-0000-4000-8000-000000009506';
select set_config('test.offline_payload',(select request::text from public.pos_sales where id='00000000-0000-4000-8000-000000009506'),false);
set role authenticated;
do $$
declare shop uuid:=current_setting('test.offline_shop')::uuid; sale jsonb:=current_setting('test.offline_payload')::jsonb;
begin
 perform public.pos_checkout(shop,sale);
 assert (select quantity from public.inventory_balances where ingredient_id='00000000-0000-4000-8000-000000009503')=1,'Late retry consumed stock';
 -- Membership alone cannot replay another cashier's saved request.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009501',false);
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,sale),'Sale ID already used for a different sale');
 -- Membership is checked before inspecting even a malformed request identifier.
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009502',false);
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,sale),'Shop access required');
 perform pg_temp.expect_offline_error(format('select public.pos_checkout(%L,%L)',shop,'{"id":"invalid"}'),'Shop access required');
end $$;
reset role;
rollback;
