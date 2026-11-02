-- Run only in the disposable cluster created by check-simple-pos.py.
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin
 begin execute command; exception when others then
  if position(expected in sqlerrm)=0 then raise exception 'Expected %, got %',expected,sqlerrm;end if;
  return;
 end;
 raise exception 'Expected failure: %',expected;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select set_config('test.shop',(select shop_id::text from public.shop_members where user_id=auth.uid() and role='founder' and status='active' limit 1),false);
do $$declare shop uuid:=current_setting('test.shop')::uuid;
 cat uuid:='00000000-0000-4000-8000-000000000100'; prod uuid:='00000000-0000-4000-8000-000000000101';
 first_size uuid:='00000000-0000-4000-8000-000000000102'; second_size uuid:='00000000-0000-4000-8000-000000000103';
 payload jsonb; saved jsonb; receipt jsonb; sizes jsonb;
begin
 perform public.pos_save_category(shop,jsonb_build_object('id',cat,'name','Coffee'));
 sizes:=jsonb_build_array(
  jsonb_build_object('id',first_size,'label','12 oz','price_cents',12000,'cost_cents',4000,'active',true,'is_default',true),
  jsonb_build_object('id',second_size,'label','16 oz','price_cents',14500,'cost_cents',5000,'active',true,'is_default',false));
 payload:=jsonb_build_object('id',prod,'name','Sized latte','price_cents',12000,'cost_cents',4000,'category_id',cat,'description','Our actual menu description','image_url','/icons/coffee.svg','active',true,'sizes',sizes);
 saved:=public.pos_save_product(shop,payload);
 assert saved->'sizes'=sizes;
 perform pg_temp.expect_error(format('select public.pos_save_category(%L,%L)',shop,'{"name":" coffee "}'),'already exists');
 perform pg_temp.expect_error(format('select public.pos_delete_category(%L,%L)',shop,cat),'Reassign');
 -- Same product/different sizes are distinct lines. Costs use the selected size.
 receipt:=jsonb_build_object('id','00000000-0000-4000-8000-000000000105','method','cash','items',jsonb_build_array(
  jsonb_build_object('product_id',prod,'size_id',first_size,'size_label','12 oz','price_cents',12000,'quantity',2),
  jsonb_build_object('product_id',prod,'size_id',second_size,'size_label','16 oz','price_cents',14500,'quantity',1)));
 perform public.pos_checkout(shop,receipt);
 assert (select total_cents from public.pos_sales where id=(receipt->>'id')::uuid)=38500;
 assert (select total_cost_cents from public.pos_sales where id=(receipt->>'id')::uuid)=13000;
 assert (select items->1->>'size_label' from public.pos_sales where id=(receipt->>'id')::uuid)='16 oz';
 assert (select items->1->>'unit_price_cents' from public.pos_sales where id=(receipt->>'id')::uuid)='14500';
 perform pg_temp.expect_error(format('select public.pos_checkout(%L,%L)',shop,jsonb_set(jsonb_set(receipt,'{id}',to_jsonb(gen_random_uuid())), '{items,0,size_label}','"Wrong size"')),'label changed');
 perform pg_temp.expect_error(format('select public.pos_checkout(%L,%L)',shop,jsonb_set(jsonb_set(receipt,'{id}',to_jsonb(gen_random_uuid())), '{items,0,price_cents}','1')),'price changed');
 perform pg_temp.expect_error(format('select public.pos_checkout(%L,%L)',shop,jsonb_set(jsonb_set(receipt,'{id}',to_jsonb(gen_random_uuid())), '{items,1}',receipt->'items'->0)),'Duplicate');
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_set(payload,'{sizes,1,label}','" 12 OZ "')),'Check size');
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_set(payload,'{sizes,0,price_cents}','-1')),'Check size');
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_set(payload,'{sizes,0,price_cents}','1.5')),'Check size');
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_set(payload,'{sizes,0,is_default}','false')),'Check size');
 -- Old payloads preserve metadata and sizes; a legacy client cannot overwrite size prices.
 perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name','Renamed latte','price_cents',12000,'active',true));
 assert (select p.sizes from public.pos_products p where p.id=prod)=sizes;
 assert (select category_id from public.pos_products where id=prod)=cat;
 assert (select image_url from public.pos_products where id=prod)='/icons/coffee.svg';
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,jsonb_build_object('id',prod,'name','Legacy price','price_cents',1,'active',true)),'Menu Management');
 -- Disable a size, remove it, and edit prices without touching the completed receipt.
 perform public.pos_save_product(shop,jsonb_set(payload,'{sizes,1,active}','false'));
 perform pg_temp.expect_error(format('select public.pos_checkout(%L,%L)',shop,jsonb_set(receipt,'{id}',to_jsonb(gen_random_uuid()))),'no longer available');
 payload:=jsonb_set(payload,'{sizes}',jsonb_build_array(jsonb_set(sizes->0,'{price_cents}','13000')));
 perform public.pos_save_product(shop,payload);
 assert (select items->0->>'unit_price_cents' from public.pos_sales where id=(receipt->>'id')::uuid)='12000';
 assert (select items->1->>'size_label' from public.pos_sales where id=(receipt->>'id')::uuid)='16 oz';
 -- An already-confirmed retry succeeds even after menu edits/removal.
 perform public.pos_checkout(shop,receipt);
 perform public.pos_archive_product(shop,prod);
 perform public.pos_archive_product(shop,prod);
 assert (select archived_at is not null and not active from public.pos_products where id=prod);
 perform public.pos_checkout(shop,receipt);
 perform public.pos_delete_category(shop,cat);
 assert not exists(select 1 from public.pos_categories where id=cat);
 assert (select total_cost_cents from public.pos_sales where id=(receipt->>'id')::uuid)=13000;
 -- Zero-priced and unsized legacy products still use the regular checkout path.
 perform public.pos_save_product(shop,'{"id":"00000000-0000-4000-8000-000000000104","name":"Complimentary item","price_cents":0,"cost_cents":100,"active":true}');
 perform public.pos_checkout(shop,'{"id":"00000000-0000-4000-8000-000000000106","method":"gcash","items":[{"product_id":"00000000-0000-4000-8000-000000000104","price_cents":0,"quantity":1}]}');
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$declare shop uuid:=current_setting('test.shop')::uuid;other_shop uuid;other_cat uuid;
begin
 assert (select count(*) from public.pos_categories)=0;
 perform pg_temp.expect_error(format('select public.pos_save_category(%L,%L)',shop,'{"name":"Wrong shop"}'),'Owner access');
 perform pg_temp.expect_error(format('select public.pos_archive_product(%L,%L)',shop,'00000000-0000-4000-8000-000000000104'),'Owner access');
 other_shop:=public.create_shop('Other shop','Asia/Manila');
 other_cat:=(public.pos_save_category(other_shop,'{"name":"Other category"}')->>'id')::uuid;
 perform set_config('test.other_category',other_cat::text,false);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$begin
 assert not exists(select 1 from public.pos_categories where id=current_setting('test.other_category')::uuid);
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',current_setting('test.shop'),jsonb_build_object('name','Cross category','price_cents',100,'active',true,'category_id',current_setting('test.other_category'))),'this shop');
 perform pg_temp.expect_error(format('insert into public.pos_categories(shop_id,name) values(%L,%L)',current_setting('test.shop'),'Direct write'),'permission denied');
end $$;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000108','staff@test.invalid');
insert into public.shop_members(shop_id,user_id,role,status) values(current_setting('test.shop')::uuid,'00000000-0000-4000-8000-000000000108','staff','active');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000108',false);
do $$declare shop uuid:=current_setting('test.shop')::uuid;begin
 perform pg_temp.expect_error(format('select public.pos_save_category(%L,%L)',shop,'{"name":"Staff category"}'),'Owner access');
 perform pg_temp.expect_error(format('select public.pos_save_product(%L,%L)',shop,'{"name":"Staff product","price_cents":100,"active":true}'),'Owner access');
 perform pg_temp.expect_error(format('select public.pos_delete_category(%L,%L)',shop,gen_random_uuid()),'Owner access');
 perform public.pos_checkout(shop,'{"id":"00000000-0000-4000-8000-000000000109","method":"cash","items":[{"product_id":"00000000-0000-4000-8000-000000000104","price_cents":0,"quantity":1}]}');
end $$;
