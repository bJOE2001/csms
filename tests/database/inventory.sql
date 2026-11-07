-- Disposable integration checks only. No records are created in a hosted shop.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000009000','inventory@example.invalid');
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin
 begin execute command; exception when others then
  if position(expected in sqlerrm)=0 then raise exception 'Expected %, got %',expected,sqlerrm;end if;return;
 end;raise exception 'Expected failure: %',expected;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009000',false);
select set_config('test.inventory_shop',public.create_shop('Inventory test shop','Asia/Manila')::text,false);
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid; item uuid:='00000000-0000-4000-8000-000000009001'; payload jsonb; revision bigint;
begin
 assert public.pos_inventory_read(shop,current_date,current_date)->'items'='[]'::jsonb,'Inventory must start empty';
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',item,'name','Ground Coffee','base_unit','g','item_type','ingredient','minimum_stock',100,'active',true));
 payload:=jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','opening','quantity',2,'purchase_unit','kg','total_cost_cents',100000,'occurred_on',current_date,'reason','Opening physical balance');
 perform public.pos_inventory_post(shop,payload); perform public.pos_inventory_post(shop,payload);
 assert (select quantity from public.inventory_balances where ingredient_id=item)=2000;
 assert (select count(*) from public.stock_movements where ingredient_id=item)=1;
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','receipt','quantity',1,'purchase_unit','kg','total_cost_cents',100000,'occurred_on',current_date,'reason','Stock received'));
 assert (select value_cents from public.inventory_balances where ingredient_id=item)=200000;
 assert (select quantity from public.inventory_balances where ingredient_id=item)=3000;
 revision:=(select b.revision from public.inventory_balances b where ingredient_id=item);
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','waste','quantity',300,'purchase_unit','g','occurred_on',current_date,'reason','Spillage'));
 assert (select value_cents from public.inventory_balances where ingredient_id=item)=180000;
 perform pg_temp.expect_error(format('select public.pos_inventory_post(%L,%L)',shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','count','quantity',2600,'purchase_unit','g','expected_revision',revision,'occurred_on',current_date,'reason','Physical count correction')),'Stock changed');
 revision:=(select b.revision from public.inventory_balances b where ingredient_id=item);
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','count','quantity',2690,'purchase_unit','g','expected_revision',revision,'occurred_on',current_date,'reason','Physical count correction'));
 assert (select quantity from public.inventory_balances where ingredient_id=item)=2690;
 assert (select previous_quantity from public.stock_movements where ingredient_id=item and kind='count')=2700;
 assert (select resulting_quantity from public.stock_movements where ingredient_id=item and kind='count')=2690;
 perform pg_temp.expect_error(format('select public.pos_inventory_post(%L,%L)',shop,payload||jsonb_build_object('operation_id',gen_random_uuid())),'Opening stock already');
 perform pg_temp.expect_error(format('select public.pos_inventory_post(%L,%L)',shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'kind','receipt','purchase_unit','L')),'Purchase unit must match');
 perform pg_temp.expect_error(format('select public.pos_inventory_save_item(%L,%L)',shop,jsonb_build_object('id',item,'name','Ground Coffee','base_unit','ml','item_type','ingredient','minimum_stock',0,'active',true)),'Base unit cannot change');
end $$;
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid; prod uuid:='00000000-0000-4000-8000-000000009002'; size_id uuid:='00000000-0000-4000-8000-000000009011'; payload jsonb; catalog jsonb;
begin
 perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name','Inventory latte','price_cents',12000,'cost_cents',5000,'active',true,'sizes',jsonb_build_array(jsonb_build_object('id',size_id,'label','12 oz','price_cents',12000,'cost_cents',5000,'active',true,'is_default',true))));
 payload:=jsonb_build_object('operation_id',gen_random_uuid(),'product_id',prod,'size_id',size_id,'action','draft','mode','recipe','expected_revision',0,'components','[]'::jsonb);
 perform public.pos_inventory_recipe(shop,payload);
 assert public.pos_inventory_catalog(shop)->prod::text->size_id::text->>'state'='draft';
 perform pg_temp.expect_error(format('select public.pos_inventory_recipe(%L,%L)',shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',1)),'recorded costs');
 payload:=payload||jsonb_build_object('operation_id',gen_random_uuid(),'expected_revision',1,'components',jsonb_build_array(jsonb_build_object('ingredient_id','00000000-0000-4000-8000-000000009001','quantity','18')));
 perform public.pos_inventory_recipe(shop,payload);
 perform public.pos_inventory_recipe(shop,payload||jsonb_build_object('operation_id',gen_random_uuid(),'action','activate','expected_revision',2));
 catalog:=public.pos_inventory_catalog(shop);
 assert catalog->prod::text->size_id::text->>'state'='active';
 assert (catalog->prod::text->size_id::text->>'cost_cents')::bigint=1200;
 assert (catalog->prod::text->size_id::text->>'max_quantity')::integer=100;
 assert jsonb_array_length(catalog->prod::text->size_id::text->'components')=1;
 assert (public.pos_inventory_read(shop,current_date,current_date)->'items'->0->>'has_movements')::boolean=true;
 assert (public.pos_inventory_read(shop,current_date,current_date)->'items'->0->>'unit_locked')::boolean=true;
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_build_object('id',prod,'name','Inventory latte','price_cents',12000,'cost_cents',5000,'active',true,'sizes','[]'::jsonb)),'Deactivate the size recipe');
end $$;
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid; cup uuid:='00000000-0000-4000-8000-000000009021'; pastry uuid:='00000000-0000-4000-8000-000000009022'; pastry_prod uuid:='00000000-0000-4000-8000-000000009023';
begin
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',cup,'name','Cold Cup - 16 oz','base_unit','each','item_type','ingredient','minimum_stock',10,'notes','','active',true));
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',cup,'name','Cold Cup - 16 oz','base_unit','each','item_type','supply','minimum_stock',10,'notes','Reclassified packaging','active',true));
 assert (select item_type from public.ingredients where id=cup)='supply';
 assert exists(select 1 from public.audit_logs where shop_id=shop and entity_id=cup and action='inventory.item.saved' and context->'before'->>'item_type'='ingredient');
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',pastry,'name','Butter Croissant','base_unit','each','item_type','finished_good','minimum_stock',2,'notes','','active',true));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',pastry,'kind','opening','quantity',10,'purchase_unit','each','total_cost_cents',35000,'occurred_on',current_date,'reason','Opening stock'));
 perform public.pos_save_product(shop,jsonb_build_object('id',pastry_prod,'name','Croissant','price_cents',8500,'cost_cents',3500,'active',true,'sizes','[]'::jsonb));
 perform public.pos_inventory_recipe(shop,jsonb_build_object('operation_id',gen_random_uuid(),'product_id',pastry_prod,'size_id',null,'action','draft','mode','finished_good','expected_revision',0,'components',jsonb_build_array(jsonb_build_object('ingredient_id',pastry,'quantity','1'))));
 perform public.pos_inventory_recipe(shop,jsonb_build_object('operation_id',gen_random_uuid(),'product_id',pastry_prod,'size_id',null,'action','activate','expected_revision',1));
 perform pg_temp.expect_error(format('select public.pos_inventory_save_item(%L,%L)',shop,jsonb_build_object('id',pastry,'name','Butter Croissant','base_unit','each','item_type','ingredient','minimum_stock',2,'notes','','active',true)),'Deactivate finished-good product tracking');
end $$;
reset role;
rollback;
