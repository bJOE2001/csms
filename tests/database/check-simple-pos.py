"""Disposable PostgreSQL integration test. Never connects to hosted Supabase."""
from pathlib import Path
import subprocess, tempfile, sys, json, uuid
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[2]
pg=Path(sys.argv[1] if len(sys.argv)>1 else r"C:/Program Files/PostgreSQL/17/bin")
base=root/".local";base.mkdir(exist_ok=True)
cluster=Path(tempfile.mkdtemp(prefix="simple-pos-db-",dir=base)).resolve()
assert cluster.is_relative_to(base.resolve())
def run(name,*args,input=None):
 if name=="pg_ctl":
  with (cluster/"control.log").open("a") as output:
   r=subprocess.run([str(pg/(name+".exe")),*args],stdout=output,stderr=output)
  if r.returncode:raise RuntimeError((cluster/"control.log").read_text())
  return ""
 r=subprocess.run([str(pg/(name+".exe")),*args],input=input,text=True,encoding="utf-8",capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr+r.stdout)
 return r.stdout
def sql(text):return run("psql","-h","127.0.0.1","-p","55439","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1",input=text)
started=False
try:
 run("initdb","-D",str(cluster),"-U","postgres","-A","trust","--encoding=UTF8")
 run("pg_ctl","-D",str(cluster),"-l",str(cluster/"server.log"),"-o","-h 127.0.0.1 -p 55439","-w","start");started=True
 sql("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;")
 for migration in sorted((root/"supabase/migrations").glob("*.sql")):
  if migration.name in {"202611070006_recipe_only_costing.sql", "202611130001_offline_sale_time.sql", "202611140002_user_access_control.sql"}:continue # Legacy compatibility gates precede the selling-policy, offline-time and permission upgrades.
  if migration.name=="202611020001_simple_pos.sql":sql((root/"tests/database/pre-upgrade.sql").read_text(encoding="utf-8"))
  sql(migration.read_text(encoding="utf-8"))
 publication_setup=(root/"supabase/publication/publish-public-menu.sql").read_text(encoding="utf-8")
 sql(publication_setup+publication_setup) # The sole legacy shop is selected; retries are idempotent.
 sql((root/"supabase/migrations/202611060001_public_menu.sql").read_text(encoding="utf-8"))
 sql((root/"supabase/migrations/202611140001_public_menu_top_sales.sql").read_text(encoding="utf-8"))
 sql("do $$begin assert (select count(*) from public.shops where public_menu_enabled)=1, 'Migration retry reset publication';end $$;update public.shops set public_menu_enabled=false;")
 sql("do $$begin assert (select total_cents from public.pos_sales where id='00000000-0000-4000-8000-000000000098')=12000;assert (select items->0->>'name' from public.pos_sales where id='00000000-0000-4000-8000-000000000098')='Original latte · Regular';assert (select count(*) from public.pos_products where name='Original latte')=1;end $$;")
 print(sql((root/"tests/database/simple-pos.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/profit.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/record-cost.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/menu.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/expenses-management.sql").read_text(encoding="utf-8")))
 sql((root/"supabase/migrations/202611060001_public_menu.sql").read_text(encoding="utf-8")) # Idempotent reapplication.
 sql((root/"supabase/migrations/202611140001_public_menu_top_sales.sql").read_text(encoding="utf-8")) # Idempotent reapplication.
 print(sql((root/"tests/database/public-menu.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/inventory.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/inventory-checkout.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/inventory-integrity.sql").read_text(encoding="utf-8")))
 sql((root/"tests/database/inventory-concurrency.sql").read_text(encoding="utf-8"))
 race_shop="(select shop_id from public.ingredients where id='00000000-0000-4000-8000-000000009201')"
 race_access="select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009200',false);set role authenticated;"
 def checkout_race(payload):
  try:
   sql(race_access+"begin;select pg_sleep(0.1);select public.pos_checkout("+race_shop+",'"+json.dumps(payload)+"'::jsonb);commit;")
   return True
  except RuntimeError as error:
   if 'Insufficient stock' not in str(error):raise
   return False
 race_payload=lambda:{'id':str(uuid.uuid4()),'method':'cash','items':[{'product_id':'00000000-0000-4000-8000-000000009202','quantity':1,'price_cents':500}]}
 with ThreadPoolExecutor(max_workers=2) as pool: assert sum(pool.map(checkout_race,[race_payload(),race_payload()]))==1,'Concurrent checkout oversold stock'
 sql("do $$begin assert (select quantity from public.inventory_balances where ingredient_id='00000000-0000-4000-8000-000000009201')=0;assert (select count(*) from public.stock_movements where ingredient_id='00000000-0000-4000-8000-000000009201' and kind='sale')=1;end $$;")
 sql(race_access+"select public.pos_inventory_post("+race_shop+",jsonb_build_object('operation_id',gen_random_uuid(),'ingredient_id','00000000-0000-4000-8000-000000009201','kind','receipt','quantity','1','purchase_unit','each','total_cost_cents',100,'occurred_on',current_date,'reason','Retry fixture'));")
 same_sale=race_payload()
 with ThreadPoolExecutor(max_workers=2) as pool: assert all(pool.map(checkout_race,[same_sale,same_sale])),'Concurrent identical retry failed'
 sql("do $$begin assert (select quantity from public.inventory_balances where ingredient_id='00000000-0000-4000-8000-000000009201')=0;assert (select count(*) from public.stock_movements where ingredient_id='00000000-0000-4000-8000-000000009201' and kind='sale')=2;end $$;")
 print('Concurrent stock protection and identical-sale retry assertions passed.')
 try:
  sql(publication_setup)
 except RuntimeError as error:
  if 'Choose the shop with coffee_pos.public_menu_shop_id' not in str(error):raise
 else:raise RuntimeError("Public menu setup accepted an ambiguous target shop")
 sql("select set_config('coffee_pos.public_menu_shop_id',(select id::text from public.shops where name='Legacy shop'),false);"+publication_setup+publication_setup)
 sql("do $$begin assert (select count(*) from public.shops where public_menu_enabled)=1;assert (select public_menu_enabled from public.shops where name='Legacy shop');end $$;update public.shops set public_menu_enabled=false;")
 print("Public menu setup selection, retries and migration preservation passed.")
 storage_setup=(root/"supabase/storage/product-images.sql").read_text(encoding="utf-8")
 sql((root/"tests/database/storage-fixture.sql").read_text(encoding="utf-8"))
 sql(storage_setup)
 sql(storage_setup) # Storage configuration must be safe to apply twice.
 print(sql((root/"tests/database/product-image-storage.sql").read_text(encoding="utf-8")))
 seed=(root/"supabase/seeds/demo_october_2026.sql").read_text(encoding="utf-8")
 seed_checks=(root/"tests/database/demo-seed.sql").read_text(encoding="utf-8")
 try:
  sql(seed)
 except RuntimeError as error:
  if 'Sample data is opt-in' not in str(error):raise
 else:raise RuntimeError('Sample seed ran without explicit opt-in')
 seed_setup="""
 select set_config('coffee_pos.allow_sample_data','on',false);
 insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000777','demo-owner@test.invalid');
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000777',false);
 select set_config('coffee_pos.demo_shop_id',public.create_shop('Demo seed test shop','Asia/Manila')::text,false);
 create temp view seed_observed_rows as
   select 'products' kind,id,to_jsonb(p) snapshot from public.pos_products p
   union all select 'categories',id,to_jsonb(c) from public.pos_categories c
   union all select 'sales',id,to_jsonb(s) from public.pos_sales s
   union all select 'expenses',id,to_jsonb(e) from public.pos_expenses e
   union all select 'shops',id,to_jsonb(s) from public.shops s
   union all select 'members',id,to_jsonb(m) from public.shop_members m
   union all select 'users',id,to_jsonb(u) from auth.users u;
 create temp table before_seed as select * from seed_observed_rows;
 """
 first_checks="""
 do $$ begin
   assert not exists(select * from before_seed except select * from seed_observed_rows), 'Existing records changed';
 end $$;
 update public.pos_products set description='[Demo] Owner-edited description retained.'
   where id=pg_temp.coffee_demo_id(current_setting('coffee_pos.demo_shop_id')::uuid,'product:Americano');
 create temp table first_seed as select * from seed_observed_rows;
 """
 repeat_checks="""
 do $$ begin
   assert not exists(select * from first_seed except select * from seed_observed_rows), 'Rerun changed records';
   assert not exists(select * from seed_observed_rows except select * from first_seed), 'Rerun added duplicates';
 end $$;
 """
 cleanup=(root/"supabase/seeds/cleanup_demo_cancellations.sql").read_text(encoding="utf-8")
 cleanup_setup=(root/"tests/database/demo-cancellation-cleanup.sql").read_text(encoding="utf-8")
 cleanup_checks="""
 do $$ begin
   assert not exists(select 1 from public.pos_sales where id in(select id from old_demo_cancellations where fixture_number>2)), 'Old demo cancellation survived';
   assert not exists(select id,snapshot from cleanup_protected except select id,to_jsonb(s) from public.pos_sales s), 'Cleanup changed a protected receipt';
   assert not exists(select id,to_jsonb(s) from public.pos_sales s except select id,snapshot from cleanup_protected), 'Cleanup changed another record';
 end $$;
 """
 print(sql(seed_setup+seed+seed_checks+first_checks+seed+seed_checks+repeat_checks+cleanup_setup+cleanup+cleanup_checks+cleanup+cleanup_checks))
 try:
  sql("select set_config('coffee_pos.allow_sample_data','on',false);select set_config('coffee_pos.demo_shop_id','',false);"+seed)
 except RuntimeError as error:
  if 'Select a shop with coffee_pos.demo_shop_id' not in str(error):raise
 else:raise RuntimeError("Demo seed accepted an ambiguous target shop")
 try:
  sql("select set_config('coffee_pos.demo_shop_id','',false);"+cleanup)
 except RuntimeError as error:
  if 'Select a shop with coffee_pos.demo_shop_id' not in str(error):raise
 else:raise RuntimeError("Demo cleanup accepted an ambiguous target shop")
 print("Demo seed date range, snapshots, permissions, preservation and idempotence passed.")
 sql((root/"supabase/migrations/202611070006_recipe_only_costing.sql").read_text(encoding="utf-8"))
 sql((root/"supabase/migrations/202611130001_offline_sale_time.sql").read_text(encoding="utf-8"))
 sql("do $$begin assert not exists(select 1 from public.pos_sales where received_at is distinct from created_at), 'Offline upgrade changed historical dates';end $$;")
 print(sql((root/"tests/database/offline-checkout.sql").read_text(encoding="utf-8")))
 print("Offline capture dates, audit times, exact-request retries, authorization and stock rollback passed.")
 access_migration=(root/"supabase/migrations/202611140002_user_access_control.sql").read_text(encoding="utf-8")
 sql(access_migration)
 print(sql((root/"tests/database/user-access.sql").read_text(encoding="utf-8")))
 sql((root/"tests/database/user-access-retry.sql").read_text(encoding="utf-8"))
 access_snapshot="""copy (select jsonb_build_object(
  'users',(select jsonb_agg(to_jsonb(x) order by id) from auth.users x),
  'members',(select jsonb_agg(to_jsonb(x) order by id) from public.shop_members x),
  'invitations',(select jsonb_agg(to_jsonb(x) order by id) from public.membership_invites x),
  'sales',(select jsonb_agg(to_jsonb(x) order by id) from public.pos_sales x),
  'expenses',(select jsonb_agg(to_jsonb(x) order by id) from public.pos_expenses x),
  'products',(select jsonb_agg(to_jsonb(x) order by id) from public.pos_products x),
  'stock_movements',(select jsonb_agg(to_jsonb(x) order by id) from public.stock_movements x),
  'audit',(select jsonb_agg(to_jsonb(x) order by id) from public.audit_logs x))) to stdout;"""
 before_access_retry=sql(access_snapshot)
 for attempt in range(2):
  sql(access_migration)
  assert sql(access_snapshot)==before_access_retry,'Access migration retry changed saved permissions, invitations or business history'
 # Model a partial SQL Editor application: columns/functions exist but checks
 # and one policy are missing. Recovery must restore them without changing rows.
 sql("alter table public.shop_members drop constraint shop_members_permissions_check;alter table public.membership_invites drop constraint membership_invites_permissions_check;drop policy pos_products_read on public.pos_products;")
 sql(access_migration)
 assert sql(access_snapshot)==before_access_retry,'Partial access migration recovery changed saved data'
 sql("do $$begin assert (select count(*) from pg_catalog.pg_constraint where (conrelid='public.shop_members'::regclass and conname='shop_members_permissions_check') or (conrelid='public.membership_invites'::regclass and conname='membership_invites_permissions_check'))=2,'Permission validation checks missing';end $$;")
 print(sql((root/"tests/database/user-access.sql").read_text(encoding="utf-8")))
 print("Access migration repeated runs and partial recovery preserve permissions, invitations, users and business history.")
 print("All migrations and legacy compatibility assertions passed; recipe-only policy applied. Run reset-development.py for new-policy integration gates.")
finally:
 if started:run("pg_ctl","-D",str(cluster),"-m","fast","-w","stop")
 # Preserve this unique, stopped test cluster for inspection. Never delete another cluster.
