insert into auth.users(id,email) values('00000000-0000-4000-8000-000000009200','inventory-race@example.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009200',false);
select set_config('test.inventory_shop',public.create_shop('Inventory concurrency shop','Asia/Manila')::text,false);
do $$declare shop uuid:=current_setting('test.inventory_shop')::uuid; item uuid:='00000000-0000-4000-8000-000000009201'; prod uuid:='00000000-0000-4000-8000-000000009202'; config jsonb;
begin
 perform public.pos_inventory_save_item(shop,jsonb_build_object('id',item,'name','Test finished good','base_unit','each','item_type','finished_good','minimum_stock',0,'active',true));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id',item,'kind','opening','quantity','1','purchase_unit','each','total_cost_cents',100,'occurred_on',current_date,'reason','Concurrency fixture'));
 perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name','Test finished good','price_cents',500,'cost_cents',100,'active',true));
 config:=jsonb_build_object('operation_id',gen_random_uuid(),'product_id',prod,'action','draft','mode','finished_good','expected_revision',0,'components',jsonb_build_array(jsonb_build_object('ingredient_id',item,'quantity','1')));
 perform public.pos_inventory_recipe(shop,config);
 perform public.pos_inventory_recipe(shop,config||jsonb_build_object('operation_id',gen_random_uuid(),'expected_revision',1,'action','activate'));
end $$;
reset role;
