-- GENERATED ENTRY POINT: run hosted_development_reset.sql, not this fragment.
-- Explicit development reset requested by the owner. NOT a deployment migration.
-- Intended project: xygyuaszjqpyeaqrqhxd.supabase.co (verify your SQL Editor project).
-- Replaces ONE shop's business data; preserves Auth, memberships and configuration.
-- A private, non-API-accessible backup is retained before replacement.
begin;
set local lock_timeout='10s';
set local statement_timeout='180s';
-- Leave blank only when this database contains exactly one shop.
select set_config('logo.hosted_target_shop','',true);
select set_config('logo.hosted_reset_confirm','RESET LOGO DEVELOPMENT BUSINESS DATA',true);

create temp table logo_reset_scope(shop_id uuid primary key, backup_id uuid) on commit drop;
create temp table logo_reset_tables(name text primary key) on commit drop;
insert into logo_reset_tables values
 ('pos_inventory_returns'),('pos_sale_consumptions'),('pos_inventory_configs'),('pos_recipe_versions'),('pos_stock_documents'),
 ('stock_movements'),('inventory_balances'),('recipe_items'),('recipes'),('order_consumptions'),('order_events'),('payments'),
 ('order_items'),('orders'),('pos_sessions'),('purchase_receipts'),('purchase_items'),('purchases'),('suppliers'),('pos_sales'),
 ('pos_expenses'),('pos_products'),('pos_categories'),('product_prices'),('product_variants'),('products'),('categories'),
 ('ingredients'),('cash_movements'),('cashier_shifts'),('expenses'),('founder_contributions'),('startup_budgets'),('business_operations'),('audit_logs');
create temp table logo_reset_preserved(name text primary key, digest text) on commit drop;
create temp table logo_reset_trigger_state(table_name text, trigger_name text, enabled "char") on commit drop;

do $$declare target uuid:=nullif(current_setting('logo.hosted_target_shop',true),'')::uuid; total integer; row record; snapshot jsonb; backup jsonb:='{}'; bid uuid:=gen_random_uuid(); fingerprint text;
begin
 if current_setting('logo.hosted_reset_confirm',true) is distinct from 'RESET LOGO DEVELOPMENT BUSINESS DATA' then raise exception 'Explicit development reset confirmation required';end if;
 if to_regprocedure('public.pos_inventory_create_item(uuid,jsonb)') is null or to_regprocedure('public.pos_checkout_with_inventory(uuid,jsonb)') is null then
  raise exception 'Apply application migrations through 202611070006_recipe_only_costing.sql before running this reset. No business records changed.';
 end if;
 if target is null then
  select count(*),min(id::text)::uuid into total,target from public.shops;
  if total<>1 then raise exception 'Found % shops. Set logo.hosted_target_shop to the exact shop UUID at the top of this script.',total;end if;
 end if;
 if not exists(select 1 from public.shops where id=target) or not exists(select 1 from public.shop_members where shop_id=target and role='founder' and status='active') then raise exception 'Target shop needs an existing active founder. No accounts will be created or reset.';end if;
 -- One lock order for the whole reset; wait at most ten seconds for current work.
 for row in select name from logo_reset_tables order by name loop
  if to_regclass('public.'||row.name) is null then raise exception 'Required table % is missing. Apply the complete migration chain first.',row.name;end if;
  execute format('lock table public.%I in share row exclusive mode',row.name);
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(target::text,4));
 insert into logo_reset_scope values(target,bid);
 perform set_config('logo.reset_shop',target::text,true);
 for row in select name from logo_reset_tables loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where shop_id=$1',row.name) into snapshot using target;
  backup:=backup||jsonb_build_object(row.name,snapshot);
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),'''')) from public.%I t where shop_id<>$1',row.name) into fingerprint using target;
  insert into logo_reset_preserved values('other:'||row.name,fingerprint);
 end loop;
 insert into logo_reset_preserved
  select 'auth.users',md5(coalesce(string_agg(to_jsonb(u)::text,E'\n' order by u.id),'')) from auth.users u
  union all select 'shops',md5(coalesce(string_agg(to_jsonb(s)::text,E'\n' order by s.id),'')) from public.shops s
  union all select 'shop_members',md5(coalesce(string_agg(to_jsonb(m)::text,E'\n' order by m.id),'')) from public.shop_members m
  union all select 'profiles',md5(coalesce(string_agg(to_jsonb(p)::text,E'\n' order by p.user_id),'')) from public.profiles p
  union all select 'business_settings',md5(coalesce(string_agg(to_jsonb(b)::text,E'\n' order by b.shop_id),'')) from public.business_settings b;
 insert into logo_reset_trigger_state select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and c.relname in(select name from logo_reset_tables);
 execute 'create schema if not exists logo_dev_reset';
 execute 'revoke all on schema logo_dev_reset from public,anon,authenticated';
 execute 'create table if not exists logo_dev_reset.backups(id uuid primary key,shop_id uuid not null,created_at timestamptz not null default now(),business_records jsonb not null)';
 execute 'revoke all on logo_dev_reset.backups from public,anon,authenticated';
 execute 'insert into logo_dev_reset.backups(id,shop_id,business_records) values($1,$2,$3)' using bid,target,backup;
 raise notice 'Replacing development business data for shop %, backup %',target,bid;
end $$;

-- Disable only user triggers owned by these application tables; FK enforcement,
-- RLS, Auth tables and global replication settings are never disabled.
create or replace function pg_temp.logo_reset_triggers(restore boolean,history_only boolean) returns void language plpgsql as $$
declare row record; command text;
begin
 for row in select * from logo_reset_trigger_state where not history_only or table_name in ('stock_movements','pos_sale_consumptions','pos_inventory_returns') loop
  command:=case when not restore or row.enabled='D' then 'disable' when row.enabled='A' then 'enable always' when row.enabled='R' then 'enable replica' else 'enable' end;
  execute format('alter table public.%I %s trigger %I',row.table_name,command,row.trigger_name);
 end loop;
end $$;

create or replace function pg_temp.dev_id(label text) returns uuid language sql stable as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 from (select md5('logo-integrated-v1:'||current_setting('logo.reset_shop')||':'||label) h) digest;
$$;
do $$
declare shop uuid; owner_id uuid; x record; prod uuid; category uuid; sz uuid; parts jsonb; recipe jsonb; price integer; n integer; day date; sale uuid; payload jsonb; food uuid; saved_users bigint; saved_members bigint;
begin
 shop:=current_setting('logo.reset_shop')::uuid;
 select user_id into strict owner_id from public.shop_members where shop_id=shop and role='founder' and status='active' order by created_at limit 1;
 select count(*) into saved_users from auth.users;
 select count(*) into saved_members from public.shop_members;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 -- Temporarily suspend application history guards for this explicit business reset; retain foreign-key checks.
 perform pg_temp.logo_reset_triggers(false,false);
 for x in select t from unnest(array['pos_inventory_returns','pos_sale_consumptions','pos_inventory_configs','pos_recipe_versions','pos_stock_documents','stock_movements','inventory_balances','order_consumptions','order_events','payments','order_items','orders','pos_sessions','expenses','purchase_receipts','purchase_items','purchases','suppliers','pos_sales','pos_expenses','pos_products','pos_categories','recipe_items','recipes','product_prices','product_variants','products','categories','ingredients','cash_movements','cashier_shifts','founder_contributions','startup_budgets','business_operations','audit_logs']) t loop
  execute format('delete from public.%I where shop_id=$1',x.t) using shop;
 end loop;
 perform pg_temp.logo_reset_triggers(true,false);
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
  perform pg_temp.logo_reset_triggers(false,true);
  update public.pos_sales set created_at=(day+time '18:00') at time zone 'Asia/Manila' where id=sale;
  update public.stock_movements set created_at=(day+time '18:00') at time zone 'Asia/Manila' where source_id=sale;
  update public.pos_sale_consumptions set created_at=(day+time '18:00') at time zone 'Asia/Manila' where sale_id=sale;
  perform pg_temp.logo_reset_triggers(true,true);
 end loop;
 sale:=pg_temp.dev_id('returned-food-sale');
 perform public.pos_checkout(shop,jsonb_build_object('id',sale,'method','gcash','items',jsonb_build_array(jsonb_build_object('product_id',pg_temp.dev_id('product:Butter Croissant'),'quantity',1,'price_cents',8500))));
 perform public.pos_refund(shop,sale,'Unopened pastry returned');
 select id into food from public.pos_sale_consumptions where sale_id=sale;
 perform public.pos_inventory_return(shop,jsonb_build_object('operation_id',pg_temp.dev_id('food-return'),'consumption_id',food,'quantity','1','reason','Unopened and reusable'));
 perform public.pos_inventory_post(shop,jsonb_build_object('operation_id',pg_temp.dev_id('coffee-wastage'),'ingredient_id',pg_temp.dev_id('item:Ground Coffee'),'kind','waste','quantity','100','purchase_unit','g','occurred_on','2026-11-05','reason','Spillage'));
 perform public.pos_add_expense(shop,jsonb_build_object('id',pg_temp.dev_id('spillage-expense'),'spent_on','2026-11-05','description','Spillage loss','amount_cents',(select -value_delta_cents from public.stock_movements where source_id=pg_temp.dev_id('coffee-wastage')),'classification','operating_expense'));
 perform pg_temp.logo_reset_triggers(false,true);
 update public.pos_sales set created_at='2026-11-03 18:30+08' where id=sale;
 update public.pos_sale_consumptions set created_at='2026-11-03 18:30+08' where sale_id=sale;
 update public.pos_inventory_returns set created_at='2026-11-03 18:35+08' where id=pg_temp.dev_id('food-return');
 update public.stock_movements set created_at='2026-11-03 18:35+08' where source_id in (sale,pg_temp.dev_id('food-return'));
 perform pg_temp.logo_reset_triggers(true,true);
 for n in 1..4 loop perform public.pos_add_expense(shop,jsonb_build_object('id',pg_temp.dev_id('expense:'||n),'spent_on',date '2026-11-01'+n,'description',case n when 1 then 'Electricity' when 2 then 'Water Utility' when 3 then 'Internet' else 'Cleaning Supplies' end,'amount_cents',case n when 1 then 280000 when 2 then 60000 when 3 then 150000 else 45000 end,'classification','operating_expense'));end loop;
 assert (select count(*) from auth.users)=saved_users;
 assert (select count(*) from public.shop_members)=saved_members;
 assert not exists(select 1 from public.inventory_balances b where shop_id=shop and (quantity<0 or quantity<>(select sum(quantity_delta) from public.stock_movements m where m.shop_id=b.shop_id and m.ingredient_id=b.ingredient_id) or value_cents<>(select sum(value_delta_cents) from public.stock_movements m where m.shop_id=b.shop_id and m.ingredient_id=b.ingredient_id)));
 assert not exists(select 1 from public.pos_sales s where shop_id=shop and total_cost_cents is distinct from (select sum(cost_cents) from public.pos_sale_consumptions c where c.sale_id=s.id));
 assert (select count(*) from public.pos_sales where shop_id=shop)=229;
end $$;

-- Postconditions roll back the entire reset if any protected data changed.
do $$declare row record; actual text; target uuid:=(select shop_id from logo_reset_scope);
begin
 for row in select * from logo_reset_preserved loop
  if row.name like 'other:%' then
   execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),'''')) from public.%I t where shop_id<>$1',substr(row.name,7)) into actual using target;
  else
   -- Use the same stable serialization ordering as the preflight snapshot.
   if row.name='auth.users' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from auth.users t;
   elsif row.name='shops' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from public.shops t;
   elsif row.name='shop_members' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from public.shop_members t;
   elsif row.name='profiles' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.user_id),'')) into actual from public.profiles t;
   elsif row.name='business_settings' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.shop_id),'')) into actual from public.business_settings t;end if;
  end if;
  if actual is distinct from row.digest then raise exception 'Protected data changed: %. Reset rolled back.',row.name;end if;
 end loop;
 if exists(select 1 from logo_reset_trigger_state s join pg_class c on c.relname=s.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' join pg_trigger t on t.tgrelid=c.oid and t.tgname=s.trigger_name where t.tgenabled<>s.enabled) then raise exception 'Trigger restoration failed. Reset rolled back.';end if;
end $$;
select shop_id,backup_id,
 (select count(*) from public.pos_products where shop_id=s.shop_id) products,
 (select count(*) from public.ingredients where shop_id=s.shop_id) stock_items,
 (select count(*) from public.pos_inventory_configs where shop_id=s.shop_id and active_recipe_id is not null) active_recipes,
 (select count(*) from public.pos_sales where shop_id=s.shop_id) sales,
 (select count(*) from public.pos_expenses where shop_id=s.shop_id) expenses
from logo_reset_scope s;
commit;
