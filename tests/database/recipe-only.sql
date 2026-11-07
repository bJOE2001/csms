-- Run after the integrated seed. Each policy probe rolls itself back.
do $$
declare shop uuid:=current_setting('logo.reset_shop')::uuid; prod uuid:=pg_temp.dev_id('product:Cafe Latte'); size uuid:=pg_temp.dev_id('Cafe Latte:12'); denied boolean; before_items bigint; payload jsonb;
begin
 begin
  perform public.pos_inventory_recipe(shop,jsonb_build_object('operation_id',gen_random_uuid(),'product_id',prod,'size_id',size,'action','deactivate','expected_revision',2));
  denied:=false;
  begin perform public.pos_checkout(shop,jsonb_build_object('id',gen_random_uuid(),'method','cash','items',jsonb_build_array(jsonb_build_object('product_id',prod,'size_id',size,'price_cents',12000,'quantity',1))));
  exception when others then if position('Inventory recipe required' in sqlerrm)=0 then raise;end if;denied:=true;end;
  assert denied,'Deactivated size remained sellable';
  raise exception using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 denied:=false;
 begin perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name','Cafe Latte','price_cents',12000,'cost_cents',0,'active',true));
 exception when others then if position('Preparation costs are calculated' in sqlerrm)=0 then raise;end if;denied:=true;end;
 assert denied,'Manual costs accepted';
 begin
  select count(*) into before_items from public.ingredients where shop_id=shop;
  payload:=jsonb_build_object('id',gen_random_uuid(),'name','Opening check','base_unit','g','item_type','ingredient','minimum_stock','0','notes','','active',true,'initial_stock',jsonb_build_object('operation_id',gen_random_uuid(),'quantity','2000','total_cost_cents',120000,'occurred_on','2026-11-07'));
  perform public.pos_inventory_create_item(shop,payload);perform public.pos_inventory_create_item(shop,payload);
  assert (select count(*) from public.ingredients where shop_id=shop)=before_items+1;
  assert (select quantity from public.inventory_balances where ingredient_id=(payload->>'id')::uuid)=2000;
  assert (select count(*) from public.stock_movements where ingredient_id=(payload->>'id')::uuid)=1;
  raise exception using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;end;
 assert not has_function_privilege('authenticated','public.pos_record_cost(uuid,jsonb)','execute');
 assert (select count(*) from public.pos_inventory_configs where shop_id=shop and active_recipe_id is not null)=14;
 assert not exists(select 1 from public.pos_products p cross join lateral jsonb_array_elements(p.sizes) entry where p.shop_id=shop and (entry.value->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$');
 assert not exists(select 1 from public.pos_products where shop_id=shop and (name ilike '%demo%' or name ilike '%test%' or name ilike '%sample%'));
end $$;
