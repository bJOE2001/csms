-- Invoked exclusively by the guarded local reset tool, never by normal migrations.
-- Run from the project terminal: npm run dev:reset -- --confirm-local-business-reset
-- Do not paste this file into Supabase SQL Editor or set reset flags on a hosted database.
create or replace function pg_temp.dev_id(label text) returns uuid language sql immutable as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 from (select md5('logo-integrated-v1:'||label) h) digest;
$$;
do $$
declare shop uuid; owner_id uuid; x record; prod uuid; category uuid; sz uuid; parts jsonb; recipe jsonb; price integer; n integer; day date; sale uuid; payload jsonb; food uuid; saved_users bigint; saved_members bigint;
begin
 if nullif(current_setting('logo.reset_shop',true),'') is null
  or current_setting('logo.disposable_local',true) is distinct from 'confirmed'
 then raise exception 'This seed requires the local reset command. Run npm run dev:reset -- --confirm-local-business-reset from the project terminal, not Supabase SQL Editor. No business data was changed.';end if;
 if inet_server_addr() is distinct from '127.0.0.1'::inet or inet_server_port()<>55440
  or replace(current_setting('data_directory'),chr(92),'/') not like '%/.local/logo-development'
 then raise exception 'Disposable local development database required';end if;
 begin shop:=current_setting('logo.reset_shop',true)::uuid;
 exception when invalid_text_representation then raise exception 'Invalid local reset shop ID. Use the local reset command instead of running this SQL directly.';end;
 select created_by into strict owner_id from public.shops where id=shop;
 select count(*) into saved_users from auth.users;
 select count(*) into saved_members from public.shop_members;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 -- Only the guarded local superuser tool may suspend history triggers for this explicit reset.
 perform set_config('session_replication_role','replica',true);
 for x in select t from unnest(array['pos_inventory_returns','pos_sale_consumptions','pos_inventory_configs','pos_recipe_versions','pos_stock_documents','stock_movements','inventory_balances','recipe_items','recipes','order_consumptions','order_events','payments','order_items','orders','purchase_receipts','purchase_items','purchases','suppliers','pos_sales','pos_expenses','pos_products','pos_categories','product_prices','product_variants','products','categories','ingredients','cash_movements','cashier_shifts','expenses','founder_contributions','startup_budgets','business_operations','audit_logs']) t loop
  execute format('delete from public.%I where shop_id=$1',x.t) using shop;
 end loop;
 perform set_config('session_replication_role','origin',true);
 for x in select * from (values
 ('Ground Coffee','g','ingredient',10000,600000),('Fresh Milk','ml','ingredient',120000,1200000),('Filtered Water','ml','ingredient',100000,10000),
 ('Matcha Powder','g','ingredient',3000,450000),('Chocolate Powder','g','ingredient',3000,150000),('12 oz Cup','each','supply',600,180000),('16 oz Cup','each','supply',600,210000),('Cup Lid','each','supply',1200,120000),
 ('Brownie','each','finished_good',160,480000),('Chocolate Chip Cookie','each','finished_good',160,320000),('Butter Croissant','each','finished_good',160,560000),('Ham and Cheese Sandwich','each','finished_good',160,960000)
 ) v(name,unit,kind,qty,cost) loop
  perform public.pos_inventory_save_item(shop,jsonb_build_object('id',pg_temp.dev_id('item:'||x.name),'name',x.name,'base_unit',x.unit,'item_type',x.kind,'minimum_stock',case when x.unit='each' then 20 else 500 end,'notes','','active',true));
  perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',pg_temp.dev_id('opening:'||x.name),'ingredient_id',pg_temp.dev_id('item:'||x.name),'kind','opening','quantity',x.qty::text,'purchase_unit',x.unit,'total_cost_cents',x.cost,'occurred_on','2026-10-01','reason','Initial stock'));
 end loop;
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',pg_temp.dev_id('coffee-delivery'),'ingredient_id',pg_temp.dev_id('item:Ground Coffee'),'kind','receipt','quantity','2','purchase_unit','kg','total_cost_cents',130000,'occurred_on','2026-10-15','reason','Stock delivery','reference','Delivery 1001'));
 for x in select * from (values ('Coffee'),('Non-Coffee'),('Desserts'),('Food')) v(name) loop
  perform public.pos_save_category(shop,jsonb_build_object('id',pg_temp.dev_id('category:'||x.name),'name',x.name));
 end loop;
 for x in select * from (values
 ('Americano','Coffee',9500,'Espresso with hot water.'),('Cafe Latte','Coffee',12000,'Espresso with steamed milk.'),('Cappuccino','Coffee',12000,'Espresso with milk and foam.'),('Matcha Latte','Non-Coffee',15500,'Matcha blended with milk.'),('Iced Chocolate','Non-Coffee',14000,'Chocolate and milk served chilled.'),
 ('Brownie','Desserts',8000,'A rich chocolate brownie.'),('Chocolate Chip Cookie','Desserts',5500,'A cookie with chocolate chips.'),('Butter Croissant','Food',8500,'A flaky butter pastry.'),('Ham and Cheese Sandwich','Food',14000,'Ham and cheese in a sandwich.')
 ) v(name,category,price,description) loop
  prod:=pg_temp.dev_id('product:'||x.name);category:=pg_temp.dev_id('category:'||x.category);
  perform public.pos_save_product(shop,jsonb_build_object('id',prod,'name',x.name,'description',x.description,'category_id',category,'price_cents',x.price,'active',true,'sizes',case when x.category in ('Coffee','Non-Coffee') then jsonb_build_array(
   jsonb_build_object('id',pg_temp.dev_id(x.name||':12'),'label','12 oz','price_cents',x.price,'active',true,'is_default',true),
   jsonb_build_object('id',pg_temp.dev_id(x.name||':16'),'label','16 oz','price_cents',x.price+2000,'active',true,'is_default',false)) else '[]'::jsonb end));
  for n in 1..case when x.category in ('Coffee','Non-Coffee') then 2 else 1 end loop
   sz:=case when x.category in ('Coffee','Non-Coffee') then pg_temp.dev_id(x.name||case n when 1 then ':12' else ':16' end) else null end;
   if sz is null then parts:=jsonb_build_array(jsonb_build_object('ingredient_id',pg_temp.dev_id('item:'||x.name),'quantity','1'));
   else
    parts:=jsonb_build_array(jsonb_build_object('ingredient_id',pg_temp.dev_id('item:'||case when x.category='Coffee' then 'Ground Coffee' when x.name='Matcha Latte' then 'Matcha Powder' else 'Chocolate Powder' end),'quantity',case n when 1 then '18' else '22' end),jsonb_build_object('ingredient_id',pg_temp.dev_id('item:'||case when x.name='Americano' then 'Filtered Water' else 'Fresh Milk' end),'quantity',case n when 1 then '180' else '240' end),jsonb_build_object('ingredient_id',pg_temp.dev_id('item:'||case n when 1 then '12 oz Cup' else '16 oz Cup' end),'quantity','1'),jsonb_build_object('ingredient_id',pg_temp.dev_id('item:Cup Lid'),'quantity','1'));
   end if;
   recipe:=jsonb_build_object('operation_id',pg_temp.dev_id(x.name||n||':draft'),'product_id',prod,'size_id',sz,'action','draft','mode',case when sz is null then 'finished_good' else 'recipe' end,'expected_revision',0,'components',parts);
   perform public.pos_inventory_recipe(shop,recipe);
   perform public.pos_inventory_recipe(shop,recipe||jsonb_build_object('operation_id',pg_temp.dev_id(x.name||n||':activate'),'action','activate','expected_revision',1));
  end loop;
 end loop;
 for n in 1..228 loop
  day:=date '2026-10-01'+((n-1)%38);sale:=pg_temp.dev_id('sale:'||n);select p.id,p.price_cents into prod,price from public.pos_products p where p.shop_id=shop and p.name=(array['Americano','Cafe Latte','Cappuccino','Matcha Latte','Iced Chocolate'])[(n-1)%5+1]; price:=price+case when n%2=0 then 2000 else 0 end;
  payload:=jsonb_build_object('id',sale,'method',case when n%3=0 then 'gcash' else 'cash' end,'items',jsonb_build_array(jsonb_build_object('product_id',prod,'size_id',(select (v->>'id')::uuid from public.pos_products p cross join lateral jsonb_array_elements(p.sizes) v where p.id=prod and v->>'label'=case when n%2=0 then '16 oz' else '12 oz' end),'quantity',1,'price_cents',price))||case when n%3=0 then jsonb_build_array(jsonb_build_object('product_id',pg_temp.dev_id('product:Brownie'),'quantity',1,'price_cents',8000)) else '[]'::jsonb end);
  perform public.pos_checkout(shop,payload);
  if n%31=0 then perform public.pos_refund(shop,sale,'Incorrect drink refunded');end if;
  perform set_config('session_replication_role','replica',true);
  update public.pos_sales set created_at=(day+time '18:00') at time zone 'Asia/Manila' where id=sale;
  update public.stock_movements set created_at=(day+time '18:00') at time zone 'Asia/Manila' where source_id=sale;
  update public.pos_sale_consumptions set created_at=(day+time '18:00') at time zone 'Asia/Manila' where sale_id=sale;
  perform set_config('session_replication_role','origin',true);
 end loop;
 sale:=pg_temp.dev_id('returned-food-sale');
 perform public.pos_checkout(shop,jsonb_build_object('id',sale,'method','gcash','items',jsonb_build_array(jsonb_build_object('product_id',pg_temp.dev_id('product:Butter Croissant'),'quantity',1,'price_cents',8500))));
 perform public.pos_refund(shop,sale,'Unopened pastry returned');
 select id into food from public.pos_sale_consumptions where sale_id=sale;
 perform public.pos_inventory_return(shop,jsonb_build_object('operation_id',pg_temp.dev_id('food-return'),'consumption_id',food,'quantity','1','reason','Unopened and reusable'));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',pg_temp.dev_id('coffee-wastage'),'ingredient_id',pg_temp.dev_id('item:Ground Coffee'),'kind','waste','quantity','100','purchase_unit','g','occurred_on','2026-11-05','reason','Spillage'));
 perform public.pos_add_expense(shop,jsonb_build_object('id',pg_temp.dev_id('spillage-expense'),'spent_on','2026-11-05','description','Spillage loss','amount_cents',(select -value_delta_cents from public.stock_movements where source_id=pg_temp.dev_id('coffee-wastage')),'classification','operating_expense'));
 perform set_config('session_replication_role','replica',true);
 update public.pos_sales set created_at='2026-11-03 18:30+08' where id=sale;
 update public.pos_sale_consumptions set created_at='2026-11-03 18:30+08' where sale_id=sale;
 update public.pos_inventory_returns set created_at='2026-11-03 18:35+08' where id=pg_temp.dev_id('food-return');
 update public.stock_movements set created_at='2026-11-03 18:35+08' where source_id in (sale,pg_temp.dev_id('food-return'));
 perform set_config('session_replication_role','origin',true);
 for n in 1..4 loop perform public.pos_add_expense(shop,jsonb_build_object('id',pg_temp.dev_id('expense:'||n),'spent_on',date '2026-11-01'+n,'description',case n when 1 then 'Electricity' when 2 then 'Water Utility' when 3 then 'Internet' else 'Cleaning Supplies' end,'amount_cents',case n when 1 then 280000 when 2 then 60000 when 3 then 150000 else 45000 end,'classification','operating_expense'));end loop;
 assert (select count(*) from auth.users)=saved_users;
 assert (select count(*) from public.shop_members)=saved_members;
 assert not exists(select 1 from public.inventory_balances b where shop_id=shop and (quantity<0 or quantity<>(select sum(quantity_delta) from public.stock_movements m where m.shop_id=b.shop_id and m.ingredient_id=b.ingredient_id) or value_cents<>(select sum(value_delta_cents) from public.stock_movements m where m.shop_id=b.shop_id and m.ingredient_id=b.ingredient_id)));
 assert not exists(select 1 from public.pos_sales s where shop_id=shop and total_cost_cents is distinct from (select sum(cost_cents) from public.pos_sale_consumptions c where c.sale_id=s.id));
 assert (select count(*) from public.pos_sales where shop_id=shop)=229;
end $$;
