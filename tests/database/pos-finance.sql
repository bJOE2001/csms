\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
select public.create_shop('POS fixture') as shop \gset
select public.create_menu_category(:'shop','Coffee') as cat \gset
select public.create_menu_product(:'shop',:'cat','Latte','Regular',15000) as product \gset
select id as variant from public.product_variants where product_id=:'product' \gset
select public.create_ingredient(:'shop','Beans','g',60,10) as ingredient \gset
select public.publish_recipe(:'shop',:'variant',jsonb_build_array(jsonb_build_object('ingredient_id',:'ingredient','quantity','10','waste_bps',0)));
select public.set_variant_available(:'shop',:'variant',true);
select public.manage_inventory(:'shop','opening',jsonb_build_object('ingredient_id',:'ingredient','quantity','100','value_cents',6000,'reason','Counted opening stock'),gen_random_uuid());
select public.manage_settings(:'shop','device','{"name":"Fixture POS","offline_capable":true}',gen_random_uuid())->>'id' as device \gset
select public.pair_pos_device(:'shop',:'device','fixture-browser-key-012345678901234567890');
select public.manage_finance(:'shop','open_shift',jsonb_build_object('device_id',:'device','opening_cents',10000),gen_random_uuid())->>'id' as shift \gset
select public.open_pos_session(:'shop',:'device',:'shift','fixture-browser-key-012345678901234567890')->>'id' as session \gset
select gen_random_uuid() as operation \gset
select jsonb_build_object('session_id',:'session','sequence',1,'order_type','takeout','items',jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',2)),'discount_cents',0,'method','cash','tendered_cents',50000,'created_at',now()) as payload \gset
select set_config('test.pos_shop',:'shop',true),set_config('test.pos_payload',:'payload',true),set_config('test.pos_operation',:'operation',true),set_config('test.pos_session',:'session',true),set_config('test.pos_shift',:'shift',true),set_config('test.pos_ingredient',:'ingredient',true);
select public.process_order(:'shop',:'payload',:'operation');
select public.process_order(:'shop',:'payload',:'operation');
do $$ declare v_shop uuid:=current_setting('test.pos_shop')::uuid; begin
  if (select count(*) from public.orders where shop_id=v_shop)<>1 or (select quantity from public.inventory_balances where shop_id=v_shop)<>80
    or (select cogs_cents from public.orders where shop_id=v_shop)<>1200 then raise exception 'Checkout/retry/cost snapshot incorrect'; end if;
  begin perform public.process_order(v_shop,current_setting('test.pos_payload')::jsonb||'{"discount_cents":1}',current_setting('test.pos_operation')::uuid); raise exception 'Payload collision accepted';
  exception when raise_exception then if sqlerrm<>'Operation identifier was already used for different data' then raise; end if; end;
  begin perform public.process_order(v_shop,jsonb_set(current_setting('test.pos_payload')::jsonb,'{items,0,quantity}','100')||'{"sequence":2,"tendered_cents":2500000}',gen_random_uuid()); raise exception 'Oversale accepted';
  exception when raise_exception then if sqlerrm<>'Insufficient recorded stock' then raise; end if; end;
  if (select count(*) from public.orders where shop_id=v_shop)<>1 then raise exception 'Failed checkout left an order'; end if;
end $$;
select public.close_cashier_shift(:'shop',jsonb_build_object('shift_id',:'shift','last_sequence',1,'counted_cents',40000,'reason','Fixture count'),gen_random_uuid());
-- Lost-response retry works after lease expiry and finalized shift.
update public.pos_sessions set expires_at=now()-interval '1 day' where id=:'session';
select public.process_order(:'shop',:'payload',:'operation');
select public.manage_finance(:'shop','open_shift',jsonb_build_object('device_id',:'device','opening_cents',40000),gen_random_uuid())->>'id' as second_shift \gset
select public.manage_order(:'shop','refund',jsonb_build_object('order_id',:'operation','shift_id',:'second_shift','reason','Fixture refund'),gen_random_uuid());
select public.manage_order(:'shop','return_stock',jsonb_build_object('order_id',:'operation','reason','All fixture ingredients physically returned'),gen_random_uuid());
select public.manage_finance(:'shop','budget','{"name":"Equipment plan","classification":"equipment","amount_cents":10000000}',gen_random_uuid());
select public.manage_finance(:'shop','expense',jsonb_build_object('category','Rent','classification','operating','amount_cents',1000,'occurred_on',current_date,'method','bank','paid_by','Founder','description','Fixture rent'),gen_random_uuid())->>'id' as expense \gset
select public.manage_finance(:'shop','decide_expense',jsonb_build_object('id',:'expense','decision','approve','reason','Verified fixture'),gen_random_uuid());
select public.business_report(:'shop',current_date-1,current_date+1) as report \gset
select set_config('test.pos_report',:'report',true);
do $$ declare v_shop uuid:=current_setting('test.pos_shop')::uuid;v_report jsonb:=current_setting('test.pos_report')::jsonb; begin
  if (v_report#>>'{sales,gross_cents}')::bigint<>30000 or (v_report#>>'{sales,refund_cents}')::bigint<>30000
    or (v_report#>>'{sales,returned_cost_cents}')::bigint<>1200 or (v_report#>>'{finance,operating_expenses_cents}')::bigint<>1000 then raise exception 'Report does not reconcile'; end if;
  if (select quantity from public.inventory_balances where shop_id=v_shop)<>100 or (select value_cents from public.inventory_balances where shop_id=v_shop)<>6000 then raise exception 'Explicit return lost stock/value'; end if;
  begin update public.shop_members set status='suspended' where shop_id=v_shop; raise exception 'Last founder removed';
  exception when raise_exception then if sqlerrm<>'The last active founder cannot be removed' then raise; end if; end;
end $$;
select public.manage_settings(:'shop','member','{"user_id":"30000000-0000-4000-8000-000000000002","role":"staff","status":"active"}',gen_random_uuid());
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$ declare v_shop uuid:=current_setting('test.pos_shop')::uuid;begin
  if (select count(*) from public.order_consumptions where shop_id=v_shop)<>0 or (select count(*) from public.expenses where shop_id=v_shop)<>0 then raise exception 'Staff read financial costs'; end if;
  perform public.get_business_data(v_shop,'orders',0);
  begin perform public.business_report(v_shop,current_date,current_date); raise exception 'Staff read profit report'; exception when insufficient_privilege then null;end;
  begin perform public.manage_order(v_shop,'cancel',jsonb_build_object('order_id',current_setting('test.pos_operation'),'reason','Escalation'),gen_random_uuid()); raise exception 'Staff reversed order'; exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
-- Confirmation belongs to its own date, even when the sale was recorded earlier.
select public.open_pos_session(:'shop',:'device',:'second_shift','fixture-browser-key-012345678901234567890')->>'id' as wallet_session \gset
select gen_random_uuid() as wallet_order \gset
select public.process_order(:'shop',jsonb_build_object('session_id',:'wallet_session','sequence',1,'order_type','dine_in','items',jsonb_build_array(jsonb_build_object('variant_id',:'variant','quantity',1)),'method','gcash','created_at',now()),:'wallet_order');
update public.orders set created_at=now()-interval '2 days' where id=:'wallet_order';
select public.manage_order(:'shop','confirm_payment',jsonb_build_object('order_id',:'wallet_order','reason','Verified wallet fixture today'),gen_random_uuid());
select set_config('test.wallet_report',public.business_report(:'shop',current_date,current_date)::text,true);
do $$begin
  if not exists(select 1 from jsonb_array_elements(current_setting('test.wallet_report')::jsonb->'payments') p where p->>'method'='gcash' and p->>'status'='funds_confirmed' and (p->>'amount_cents')::bigint=15000) then raise exception 'Payment report ignored confirmation date';end if;
end $$;
-- Founder decisions require another founder when more than one is active.
select public.manage_settings(:'shop','member','{"user_id":"30000000-0000-4000-8000-000000000002","role":"founder","status":"active"}',gen_random_uuid());
select public.manage_finance(:'shop','expense',jsonb_build_object('category','Review fixture','classification','operating','amount_cents',100,'occurred_on',current_date,'method','bank','paid_by','Founder','description','Dual approval fixture'),gen_random_uuid())->>'id' as dual_expense \gset
select set_config('test.dual_expense',:'dual_expense',true);
do $$begin begin perform public.manage_finance(current_setting('test.pos_shop')::uuid,'decide_expense',jsonb_build_object('id',current_setting('test.dual_expense'),'decision','approve','reason','Invalid self approval'),gen_random_uuid());raise exception 'Self approval accepted';exception when insufficient_privilege then null;end;end $$;
-- Every operational read module executes successfully against the actual schema.
do $$declare section text;begin foreach section in array array['inventory','purchases','expenses','funding','budgets','shifts','settings','staff','orders','audit','pos'] loop perform public.get_business_data(current_setting('test.pos_shop')::uuid,section,0);end loop;end $$;
insert into auth.users(id,email,email_confirmed_at) values('30000000-0000-4000-8000-000000000003','invitee@example.test',now());
select public.create_membership_invite(:'shop','invitee@example.test','staff') as invite \gset
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
select public.accept_membership_invite(:'invite');
select public.accept_membership_invite(:'invite');
-- Original offline payload recovery survives policy changes and a colliding
-- old-browser sequence while preserving the finalized shift for review.
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
insert into public.business_settings(shop_id,payment_methods,max_discount_bps) values(:'shop',array['cash'],0);
select gen_random_uuid() as recovered_order \gset
select public.process_order(:'shop',jsonb_set(:'payload'::jsonb,'{items,0,quantity}','1')||'{"method":"gcash","discount_cents":100}',:'recovered_order','Reviewed original offline wallet sale and former discount policy');
select public.manage_order(:'shop','confirm_payment',jsonb_build_object('order_id',:'recovered_order','reason','Verified recovered funds'),gen_random_uuid());
select public.review_cashier_shift(:'shop',jsonb_build_object('shift_id',:'shift','reason','Reviewed late recovered sale and original count'),gen_random_uuid());
-- A pending cash request can be resolved after explicit exception closure.
select public.manage_finance(:'shop','cash_movement',jsonb_build_object('shift_id',:'second_shift','amount_cents',-100,'reason','Fixture cash payout'),gen_random_uuid())->>'id' as pending_cash \gset
select public.close_cashier_shift(:'shop',jsonb_build_object('shift_id',:'second_shift','last_sequence',1,'counted_cents',10000,'force',true,'reason','Fixture device exception closure'),gen_random_uuid());
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000002';
select public.manage_finance(:'shop','decide_cash',jsonb_build_object('id',:'pending_cash','decision','approve'),gen_random_uuid());
select public.review_cashier_shift(:'shop',jsonb_build_object('shift_id',:'second_shift','reason','Resolved pending cash request with founder review'),gen_random_uuid());
select set_config('test.reviewed_shift',:'second_shift',true);
do $$begin
  if not exists(select 1 from public.cashier_shifts where id=current_setting('test.reviewed_shift')::uuid and not unresolved and counted_cents=10000 and expected_cents=9900) then raise exception 'Closed-shift recovery changed count or could not resolve pending request';end if;
end $$;
-- Exercise receipt privacy against a real RLS-enabled Storage metadata contract.
do $$begin if(select public from storage.buckets where id='business-documents')then raise exception 'Existing public receipt bucket was not made private';end if;end $$;
set local role authenticated;
insert into storage.objects(bucket_id,name) values('business-documents',:'shop'||'/fixture.pdf');
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
do $$begin
  if exists(select 1 from storage.objects) then raise exception 'Staff read private founder documents';end if;
  begin insert into storage.objects(bucket_id,name) values('business-documents',current_setting('test.pos_shop')||'/staff-upload.pdf');raise exception 'Staff uploaded founder document';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000001';
select public.manage_inventory(:'shop','waste',jsonb_build_object('ingredient_id',:'ingredient','quantity','1','reason','Known-cost fixture wastage'),gen_random_uuid());
select set_config('test.waste_report',public.business_report(:'shop',current_date,current_date)::text,true);
do $$begin
  if(current_setting('test.waste_report')::jsonb#>>'{finance,wastage_cost_cents}')::bigint<>60 then raise exception 'Known wastage omitted from operating-cost report';end if;
end $$;
rollback;
\echo 'PASS: atomic POS, idempotent post-close retries, weighted-average COGS, refund/returns, report reconciliation and staff/last-founder restrictions'
