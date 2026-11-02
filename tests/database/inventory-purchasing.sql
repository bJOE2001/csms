\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('20000000-0000-4000-8000-000000000001');
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000001';
select public.create_shop('Inventory fixture') as shop \gset
select public.create_ingredient(:'shop','Test beans','g',60,100) as ingredient \gset
select public.manage_inventory(:'shop','supplier','{"name":"Test supplier","contact":"orders@example.test"}',gen_random_uuid())->>'id' as supplier \gset
select jsonb_build_object('supplier_id',:'supplier','status','ordered','items',jsonb_build_array(jsonb_build_object('ingredient_id',:'ingredient','quantity','3','unit_cost_cents','33.333333'))) as purchase_payload \gset
select public.manage_inventory(:'shop','purchase',:'purchase_payload',gen_random_uuid())->>'id' as purchase \gset
select id as item from public.purchase_items where purchase_id=:'purchase' \gset
select gen_random_uuid() as receipt_operation \gset
select jsonb_build_object('purchase_id',:'purchase','items',jsonb_build_array(jsonb_build_object('id',:'item','quantity','3'))) as receipt_payload \gset
select set_config('test.shop',:'shop',true),set_config('test.ingredient',:'ingredient',true),set_config('test.purchase',:'purchase',true),set_config('test.receipt_payload',:'receipt_payload',true),set_config('test.receipt_operation',:'receipt_operation',true);
do $$ begin if exists(select 1 from public.inventory_balances where shop_id=current_setting('test.shop')::uuid) then raise exception 'Planning created stock'; end if; end $$;
select public.manage_inventory(:'shop','receive',:'receipt_payload',:'receipt_operation');
select public.manage_inventory(:'shop','receive',:'receipt_payload',:'receipt_operation');
do $$ declare v_shop uuid:=current_setting('test.shop')::uuid; v_ing uuid:=current_setting('test.ingredient')::uuid; v_cost bigint; begin
  if (select quantity from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing)<>3
    or (select value_cents from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing)<>100 then raise exception 'Receipt/retry incorrect'; end if;
  begin perform public.manage_inventory(v_shop,'receive',current_setting('test.receipt_payload')::jsonb,gen_random_uuid()); raise exception 'Overreceipt accepted';
  exception when raise_exception then if sqlerrm<>'Order the purchase before receiving' then raise; end if; end;
  v_cost:=public.move_stock(v_shop,v_ing,-1,null,'sale',gen_random_uuid(),'Fixture sale');
  v_cost:=v_cost+public.move_stock(v_shop,v_ing,-1,null,'sale',gen_random_uuid(),'Fixture sale');
  v_cost:=v_cost+public.move_stock(v_shop,v_ing,-1,null,'sale',gen_random_uuid(),'Fixture sale');
  if v_cost<>100 or (select value_cents from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing)<>0 then raise exception 'Weighted average lost value'; end if;
  begin perform public.move_stock(v_shop,v_ing,-1,null,'waste',gen_random_uuid(),'Fixture'); raise exception 'Negative stock accepted';
  exception when raise_exception then if sqlerrm<>'Insufficient recorded stock' then raise; end if; end;
  begin update public.stock_movements set quantity_delta=1 where shop_id=v_shop; raise exception 'Ledger changed';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
set local role authenticated;
do $$ begin
  begin perform public.move_stock(current_setting('test.shop')::uuid,current_setting('test.ingredient')::uuid,1,0,'opening',gen_random_uuid(),'Escalation'); raise exception 'Internal stock writer exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Fractional centavos allocate cumulative purchase cost across partial receipts.
do $$ declare v_shop uuid:=current_setting('test.shop')::uuid;v_ing uuid:=current_setting('test.ingredient')::uuid;v_supplier uuid;v_purchase uuid;v_item uuid;i integer;begin
  select id into v_supplier from public.suppliers where shop_id=v_shop limit 1;
  v_purchase:=(public.manage_inventory(v_shop,'purchase',jsonb_build_object('supplier_id',v_supplier,'status','ordered','items',jsonb_build_array(jsonb_build_object('ingredient_id',v_ing,'quantity','10','unit_cost_cents','0.1'))),gen_random_uuid())->>'id')::uuid;
  select id into v_item from public.purchase_items where purchase_id=v_purchase;
  for i in 1..10 loop perform public.manage_inventory(v_shop,'receive',jsonb_build_object('purchase_id',v_purchase,'items',jsonb_build_array(jsonb_build_object('id',v_item,'quantity','1'))),gen_random_uuid());end loop;
  if (select value_cents from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing)<>1 then raise exception 'Partial receiving inflated fractional costs';end if;
  perform public.manage_inventory(v_shop,'count',jsonb_build_object('ingredient_id',v_ing,'quantity','10','value_cents',50,'reason','Full physical valuation'),gen_random_uuid());
  if not exists(select 1 from public.stock_movements where shop_id=v_shop and kind='count' and quantity_delta=0 and value_delta_cents=49) then raise exception 'Revaluation missing from ledger';end if;
  begin perform public.manage_inventory(v_shop,'count',jsonb_build_object('ingredient_id',v_ing,'quantity','0','value_cents',100,'reason','Invalid fixture'),gen_random_uuid());raise exception 'Zero stock retained value';exception when raise_exception then if sqlerrm<>'A zero count must have zero value' then raise;end if;end;
  perform public.move_stock(v_shop,v_ing,-20,null,'sale',gen_random_uuid(),'Audited fixture recovery',true);
  perform public.move_stock(v_shop,v_ing,5,10,'receipt',gen_random_uuid(),'Partial deficit receipt');
  if (select quantity from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing)<>-5 or (select value_cents from public.inventory_balances where shop_id=v_shop and ingredient_id=v_ing) is not null then raise exception 'Incoming stock did not reduce unknown deficit';end if;
end $$;
rollback;
\echo 'PASS: purchase planning, idempotent receiving, weighted-average residuals and stock integrity'
