reset role;
begin;
create role catalog_untrusted;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000910001','catalog-owner-a@test.invalid'),
 ('00000000-0000-4000-8000-000000910002','catalog-owner-b@test.invalid'),
 ('00000000-0000-4000-8000-000000910003','catalog-staff@test.invalid');
insert into public.shops(id,name,created_by) values
 ('00000000-0000-4000-8000-000000920001','Catalog A','00000000-0000-4000-8000-000000910001'),
 ('00000000-0000-4000-8000-000000920002','Catalog B','00000000-0000-4000-8000-000000910002');
insert into public.shop_members(shop_id,user_id,role,status) values
 ('00000000-0000-4000-8000-000000920001','00000000-0000-4000-8000-000000910001','founder','active'),
 ('00000000-0000-4000-8000-000000920002','00000000-0000-4000-8000-000000910002','founder','active'),
 ('00000000-0000-4000-8000-000000920001','00000000-0000-4000-8000-000000910003','staff','active');
insert into public.pos_categories(id,shop_id,name) values
 ('00000000-0000-4000-8000-000000940001','00000000-0000-4000-8000-000000920001','Coffee'),
 ('00000000-0000-4000-8000-000000940002','00000000-0000-4000-8000-000000920002','Secret other category');
insert into public.pos_products(id,shop_id,name,description,price_cents,cost_cents,active,category_id,image_url,sizes) values
 ('00000000-0000-4000-8000-000000930001','00000000-0000-4000-8000-000000920001','A Latte','Coffee and milk',15000,9000,true,'00000000-0000-4000-8000-000000940001','/site/cup.webp',
  '[{"id":"00000000-0000-4000-8000-000000950001","label":"Small","price_cents":12000,"cost_cents":4000,"active":true,"is_default":true},{"id":"00000000-0000-4000-8000-000000950002","label":"Large","price_cents":14500,"cost_cents":5000,"active":true,"is_default":false},{"id":"00000000-0000-4000-8000-000000950003","label":"Hidden","price_cents":100,"cost_cents":50,"active":false,"is_default":false}]'),
 ('00000000-0000-4000-8000-000000930002','00000000-0000-4000-8000-000000920002','Other shop product','Private until published',99900,10000,true,null,null,'[]'),
 ('00000000-0000-4000-8000-000000930003','00000000-0000-4000-8000-000000920001','B Free','Complimentary',0,100,true,null,'/api/pos','[]'),
 ('00000000-0000-4000-8000-000000930004','00000000-0000-4000-8000-000000920001','Inactive','Hidden',100,50,false,null,null,'[]'),
 ('00000000-0000-4000-8000-000000930005','00000000-0000-4000-8000-000000920001','Archived','Hidden',100,50,true,null,null,'[]'),
 ('00000000-0000-4000-8000-000000930006','00000000-0000-4000-8000-000000920001','No available sizes','Hidden',100,50,true,null,null,
  '[{"id":"00000000-0000-4000-8000-000000950004","label":"Unavailable","price_cents":100,"cost_cents":50,"active":false,"is_default":true}]'),
 ('00000000-0000-4000-8000-000000930007','00000000-0000-4000-8000-000000920001','C Cross category','Legacy invalid category relationship',100,50,true,'00000000-0000-4000-8000-000000940002','https://images.example/cup.webp','[]');
update public.pos_products set archived_at=now() where id='00000000-0000-4000-8000-000000930005';

do $$begin
 assert not exists(select 1 from public.shops where public_menu_enabled), 'Publication must default to off';
 assert not has_table_privilege('anon','public.pos_products','select');
 assert not has_table_privilege('anon','public.pos_categories','select');
 assert not has_function_privilege('catalog_untrusted','public.read_public_menu(uuid)','execute');
 assert not has_schema_privilege('catalog_untrusted','coffee_catalog_private','usage');
 assert not has_schema_privilege('anon','coffee_catalog_private','create');
 assert not (select prosecdef from pg_proc where oid='public.read_public_menu(uuid)'::regprocedure);
 assert (select prosecdef and provolatile='s' from pg_proc where oid='coffee_catalog_private.read_public_menu(uuid)'::regprocedure);
end $$;

set local role anon;
do $$declare command text;begin
 assert public.read_public_menu()='{"status":"unpublished","products":[]}'::jsonb;
 assert public.read_public_menu('00000000-0000-4000-8000-000000920001')=public.read_public_menu('00000000-0000-4000-8000-000000999999');
 foreach command in array array[
  'select * from public.pos_products', 'select * from public.pos_categories',
  'select * from public.pos_sales', 'select * from public.pos_expenses',
  'select * from public.shop_members',
  'update public.shops set public_menu_enabled=true',
  'select public.pos_save_product(''00000000-0000-4000-8000-000000920001'',''{}'')'
 ] loop
  begin execute command; raise exception 'Anonymous access unexpectedly allowed: %',command;
  exception when insufficient_privilege then null;end;
 end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000910001',true);
do $$declare changed uuid;begin
 update public.shops set public_menu_enabled=true where id='00000000-0000-4000-8000-000000920001' returning id into changed;
 assert changed='00000000-0000-4000-8000-000000920001', 'Owner must be able to publish their shop';
 changed:=null;
 update public.shops set public_menu_enabled=true where id='00000000-0000-4000-8000-000000920002' returning id into changed;
 assert changed is null, 'Owner cannot publish another shop';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000910003',true);
do $$declare changed uuid;begin
 update public.shops set public_menu_enabled=false where id='00000000-0000-4000-8000-000000920001' returning id into changed;
 assert changed is null, 'Staff cannot change publication';
 assert public.read_public_menu()->>'status'='published';
 assert (select count(*) from public.pos_products where shop_id='00000000-0000-4000-8000-000000920001')=6, 'Existing staff catalog reads remain available';
end $$;

set local role anon;
do $$declare menu jsonb;begin
 menu:=public.read_public_menu();
 assert menu->>'status'='published';
 assert jsonb_array_length(menu->'products')=3, 'Only available, non-archived products may appear';
 assert menu->'products'->0=jsonb_build_object(
  'id','00000000-0000-4000-8000-000000930001','name','A Latte','description','Coffee and milk',
  'category','Coffee','image','/site/cup.webp','price',12000,
  'sizes','[{"label":"Small","price":12000},{"label":"Large","price":14500}]'::jsonb
 ), 'Projection, active-size prices and original size order must match';
 assert (menu->'products'->1->>'price')::bigint=0, 'Zero prices must be retained';
 assert menu->'products'->1->'image'='null'::jsonb, 'Private local image routes must not appear';
 assert menu->'products'->2->>'category'='Menu selections', 'Cross-shop category names must not leak';
 assert menu::text !~ 'cost_cents|shop_id|archived_at|is_default|Secret other category|Other shop product|Hidden';
 assert menu=public.read_public_menu('00000000-0000-4000-8000-000000920001');
 assert public.read_public_menu('00000000-0000-4000-8000-000000920002')='{"status":"unpublished","products":[]}'::jsonb;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000910002',true);
update public.shops set public_menu_enabled=true where id='00000000-0000-4000-8000-000000920002';
set local role anon;
do $$begin
 assert public.read_public_menu()='{"status":"unpublished","products":[]}'::jsonb, 'Ambiguous publication must not choose an arbitrary shop';
 assert jsonb_array_length(public.read_public_menu('00000000-0000-4000-8000-000000920001')->'products')=3;
 assert jsonb_array_length(public.read_public_menu('00000000-0000-4000-8000-000000920002')->'products')=1;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000910001',true);
update public.shops set public_menu_enabled=false where id='00000000-0000-4000-8000-000000920001';
set local role anon;
do $$begin
 assert public.read_public_menu('00000000-0000-4000-8000-000000920001')='{"status":"unpublished","products":[]}'::jsonb, 'Unpublishing takes effect on the next read';
 assert jsonb_array_length(public.read_public_menu()->'products')=1;
end $$;
reset role;
update public.shops set public_menu_enabled=true where id='00000000-0000-4000-8000-000000920001';
insert into public.pos_sales(id,shop_id,created_by,total_cents,method,status,items) values
 ('00000000-0000-4000-8000-000000960001','00000000-0000-4000-8000-000000920001','00000000-0000-4000-8000-000000910001',100,'cash','completed',
  '[{"product_id":"00000000-0000-4000-8000-000000930003","name":"B Free","quantity":5,"line_total_cents":0},{"product_id":"00000000-0000-4000-8000-000000930005","name":"Archived","quantity":99,"line_total_cents":9900}]'),
 ('00000000-0000-4000-8000-000000960002','00000000-0000-4000-8000-000000920001','00000000-0000-4000-8000-000000910001',24000,'cash','refunded',
  '[{"product_id":"00000000-0000-4000-8000-000000930001","name":"A Latte","quantity":10,"line_total_cents":120000}]');
set local role anon;
do $$declare ranked jsonb;begin
 ranked:=public.read_public_menu('00000000-0000-4000-8000-000000920001');
 assert ranked->'featured_ids'='["00000000-0000-4000-8000-000000930003"]'::jsonb, 'Top sales ranking must include only completed sales of available products';
 assert ranked::text !~ '960001|960002|910001|refunded|Archived';
end $$;
rollback;
select 'Public catalog privacy, publication, pricing, sales ranking, cross-shop isolation and read-only permissions passed.';
