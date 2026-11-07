-- Focused security, fractional-cent reconciliation and atomic rollback proof.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000009300','inventory-integrity-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000009301','inventory-integrity-staff@example.invalid'),
 ('00000000-0000-4000-8000-000000009302','inventory-integrity-other@example.invalid');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009300',true);
select set_config('test.inventory_shop',public.create_shop('Inventory integrity','Asia/Manila')::text,true);
insert into public.shop_members(shop_id,user_id,role,status) values(current_setting('test.inventory_shop')::uuid,'00000000-0000-4000-8000-000000009301','staff','active');
update public.shops set public_menu_enabled=true where id=current_setting('test.inventory_shop')::uuid;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin begin execute command;exception when others then if position(expected in sqlerrm)=0 then raise exception 'Expected %, got %',expected,sqlerrm;end if;return;end;raise exception 'Expected failure: %',expected;end $$;
set local role authenticated;
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid;
 a uuid:='00000000-0000-4000-8000-000000009310';b uuid:='00000000-0000-4000-8000-000000009311';
 prod uuid:='00000000-0000-4000-8000-000000009312';small uuid:='00000000-0000-4000-8000-000000009313';large uuid:='00000000-0000-4000-8000-000000009314';
 payload jsonb; sale jsonb; original jsonb; before_balance jsonb; before_movements bigint; day date:=(now() at time zone 'Asia/Manila')::date;
begin
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',a,'name','Fractional cost ingredient','base_unit','g','item_type','ingredient','minimum_stock',1,'active',true));
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',b,'name','Missing cost ingredient','base_unit','ml','item_type','ingredient','minimum_stock',1,'active',true));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',a,'kind','opening','quantity','3','purchase_unit','g','total_cost_cents',1,'occurred_on',day,'reason','Actual fractional unit cost'));
 perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name','Fractional latte','price_cents',1000,'cost_cents',10,'active',true,'sizes',jsonb_build_array(
  jsonb_build_object('id',small,'label','Small','price_cents',1000,'cost_cents',10,'active',true,'is_default',true),
  jsonb_build_object('id',large,'label','Large','price_cents',1200,'cost_cents',15,'active',true,'is_default',false))));
 payload:=jsonb_build_object('operation_id',gen_random_uuid(),'product_id',prod,'size_id',small,'action','draft','mode','recipe','expected_revision',0,'components',jsonb_build_array(jsonb_build_object('ingredient_id',a,'quantity','1')));
 perform public.pos_inventory_recipe(shop,payload);
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'expected_revision',1,'action','activate'));
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'size_id',large));
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'size_id',large,'expected_revision',1,'action','activate'));
 sale:=jsonb_build_object('id',gen_random_uuid(),'method','cash','items',jsonb_build_array(jsonb_build_object('product_id',prod,'size_id',small,'quantity',1,'price_cents',1000),jsonb_build_object('product_id',prod,'size_id',large,'quantity',1,'price_cents',1200)));
 perform public.pos_checkout(shop,sale);
 assert (select total_cost_cents from public.pos_sales where id=(sale->>'id')::uuid)=1;
 assert (select sum(cost_cents) from public.pos_sale_consumptions where sale_id=(sale->>'id')::uuid)=1;
 assert (select value_cents from public.inventory_balances where ingredient_id=a)=0;
 assert (select quantity from public.inventory_balances where ingredient_id=a)=1;
 original:=(select to_jsonb(s) from public.pos_sales s where id=(sale->>'id')::uuid);
 -- Unknown cost is not a zero-cost recipe. An empty saved draft stays untracked.
 payload:=payload||jsonb_build_object('operation_id',gen_random_uuid(),'expected_revision',2,'components',jsonb_build_array(jsonb_build_object('ingredient_id',b,'quantity','2')));
 perform public.pos_inventory_recipe(shop,payload);
 perform pg_temp.expect_error(format('select public.pos_inventory_recipe(%L,%L)',shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',3)),'recorded costs');
 -- Explicitly free stock has a known zero valuation and may be activated.
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',b,'kind','receipt','quantity','2','purchase_unit','ml','total_cost_cents',0,'occurred_on',day,'reason','Genuinely free sample'));
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',3));
 assert public.pos_inventory_catalog(shop)->prod::text->small::text->>'cost_cents'='0';
 -- Replace the active recipe with two ingredients; the second one will be short.
 payload:=payload||jsonb_build_object('operation_id',gen_random_uuid(),'expected_revision',4,'components',jsonb_build_array(jsonb_build_object('ingredient_id',a,'quantity','1'),jsonb_build_object('ingredient_id',b,'quantity','3')));
 perform public.pos_inventory_recipe(shop,payload);
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',5));
 before_balance:=(select to_jsonb(x) from public.inventory_balances x where ingredient_id=a);
 select count(*) into before_movements from public.stock_movements where shop_id=shop;
 sale:=jsonb_build_object('id',gen_random_uuid(),'method','gcash','items',jsonb_build_array(jsonb_build_object('product_id',prod,'size_id',small,'quantity',1,'price_cents',1000)));
 perform pg_temp.expect_error(format('select public.pos_checkout(%L,%L)',shop,sale),'Insufficient stock');
 assert (select to_jsonb(x) from public.inventory_balances x where ingredient_id=a)=before_balance,'Partial ingredient deduction survived failed checkout';
 assert (select count(*) from public.stock_movements where shop_id=shop)=before_movements;
 assert not exists(select 1 from public.pos_sales where id=(sale->>'id')::uuid);
 -- Deactivation keeps history and causes active inventory availability to close.
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',a,'name','Fractional cost ingredient','base_unit','g','item_type','ingredient','minimum_stock',1,'active',false));
 assert public.pos_inventory_catalog(shop)->prod::text->large::text->>'max_quantity'='0';
 perform public.pos_archive_product(shop,prod);
 assert exists(select 1 from public.pos_sales s where to_jsonb(s)=original),'Archiving changed a historical sale';
 assert (select count(*) from public.pos_sale_consumptions where product_id=prod)=2;
end $$;
reset role;
-- A legacy unknown valuation can be corrected only by an explicit counted value.
update public.pos_products set archived_at=null,active=true where id='00000000-0000-4000-8000-000000009312';
insert into public.ingredients(id,shop_id,name,base_unit) values('00000000-0000-4000-8000-000000009315',current_setting('test.inventory_shop')::uuid,'Legacy unknown cost','g');
insert into public.inventory_balances(shop_id,ingredient_id,quantity,value_cents) values(current_setting('test.inventory_shop')::uuid,'00000000-0000-4000-8000-000000009315',2,null);
set local role authenticated;
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid;day date:=(now() at time zone 'Asia/Manila')::date;begin
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id','00000000-0000-4000-8000-000000009315','kind','count','quantity','2','purchase_unit','g','total_cost_cents',100,'expected_revision',0,'occurred_on',day,'reason','Owner verified counted value'));
 assert (select value_cents from public.inventory_balances where ingredient_id='00000000-0000-4000-8000-000000009315')=100;
 assert exists(select 1 from public.stock_movements where ingredient_id='00000000-0000-4000-8000-000000009315' and previous_value_cents is null and resulting_value_cents=100);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009301',true);
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid;catalog jsonb;begin
 perform pg_temp.expect_error(format('select public.pos_inventory_read(%L,current_date,current_date)',shop),'Access denied');
 perform pg_temp.expect_error(format('select public.pos_inventory_save_item(%L,%L)',shop,'{}'),'Access denied');
 perform pg_temp.expect_error(format('select public.pos_inventory_post(%L,%L)',shop,'{}'),'Access denied');
 perform pg_temp.expect_error(format('select public.pos_inventory_recipe(%L,%L)',shop,'{}'),'Access denied');
 perform pg_temp.expect_error(format('select public.pos_inventory_return(%L,%L)',shop,'{}'),'Access denied');
 assert (select count(*) from public.pos_recipe_versions)=0;
 assert (select count(*) from public.pos_sale_consumptions)=0;
 assert (select count(*) from public.pos_stock_documents)=0;
 catalog:=public.pos_inventory_catalog(shop);
 assert catalog::text not like '%cost_cents%' and catalog::text not like '%ingredient_name%' and catalog::text not like '%components%' and catalog::text not like '%has_draft%','Staff availability leaked purchase costs';
 assert not has_function_privilege('authenticated','public.pos_checkout_core(uuid,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.pos_inventory_move(uuid,uuid,numeric,bigint,text,uuid,text,boolean)','execute');
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009302',true);
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid;begin
 perform pg_temp.expect_error(format('select public.pos_inventory_read(%L,current_date,current_date)',shop),'Access denied');
 perform pg_temp.expect_error(format('select public.pos_inventory_catalog(%L)',shop),'Shop access required');
end $$;
set local role anon;
do $$declare catalog jsonb;begin
 assert not has_function_privilege('anon','public.pos_inventory_read(uuid,date,date)','execute');
 assert not has_function_privilege('anon','public.pos_inventory_recipe(uuid,jsonb)','execute');
 assert not has_table_privilege('anon','public.pos_sale_consumptions','select');
 catalog:=public.read_public_menu(current_setting('test.inventory_shop')::uuid);
 assert catalog->>'status'='published';
 assert jsonb_array_length(catalog->'products')=1,'Internal stock restrictions changed the public catalog';
 assert catalog::text not like '%cost_cents%' and catalog::text not like '%inventory%' and catalog::text not like '%recipe%';
end $$;
reset role;
rollback;
