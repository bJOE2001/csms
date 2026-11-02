insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000099','legacy@test.invalid');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000099',false);
select public.create_shop('Legacy shop','Asia/Manila') as legacy_shop \gset
insert into public.categories(shop_id,name) values(:'legacy_shop','Coffee') returning id as category \gset
insert into public.products(shop_id,category_id,name) values(:'legacy_shop',:'category','Original latte') returning id as product \gset
insert into public.product_variants(shop_id,product_id,name,available) values(:'legacy_shop',:'product','Regular',true) returning id as variant \gset
insert into public.product_prices(shop_id,variant_id,version,price_cents,created_by) values(:'legacy_shop',:'variant',1,12000,'00000000-0000-4000-8000-000000000099') returning id as price \gset
insert into public.recipes(shop_id,variant_id,version,cost_status,created_by) values(:'legacy_shop',:'variant',1,'unavailable','00000000-0000-4000-8000-000000000099') returning id as recipe \gset
insert into public.pos_devices(shop_id,name) values(:'legacy_shop','Old till') returning id as device \gset
insert into public.cashier_shifts(shop_id,device_id,cashier_id,opening_cents) values(:'legacy_shop',:'device','00000000-0000-4000-8000-000000000099',0) returning id as shift \gset
insert into public.pos_sessions(shop_id,device_id,shift_id,user_id,expires_at,offline_capable,menu) values(:'legacy_shop',:'device',:'shift','00000000-0000-4000-8000-000000000099',now()+interval '1 day',false,'[]') returning id as session \gset
insert into public.orders(id,shop_id,session_id,shift_id,sequence,order_type,gross_cents,discount_cents,total_cents,client_created_at,created_by,receipt_snapshot) values('00000000-0000-4000-8000-000000000098',:'legacy_shop',:'session',:'shift',1,'takeout',12000,0,12000,now(),'00000000-0000-4000-8000-000000000099','{}');
insert into public.order_items(shop_id,order_id,variant_id,price_id,recipe_id,product_name,variant_name,quantity,unit_price_cents,line_total_cents) values(:'legacy_shop','00000000-0000-4000-8000-000000000098',:'variant',:'price',:'recipe','Original latte','Regular',1,12000,12000);
insert into public.payments(shop_id,order_id,method,amount_cents,tendered_cents,status) values(:'legacy_shop','00000000-0000-4000-8000-000000000098','cash',12000,15000,'confirmed');
