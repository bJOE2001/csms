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
