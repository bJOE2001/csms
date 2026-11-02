\set ON_ERROR_STOP on
-- Isolated test database only; the hosted seeder never creates accounts or shops.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001');
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.create_shop('Seed test shop') as seeded_shop \gset
\ir ../../supabase/seed.sql
do $$ begin
  if (select count(*) from public.categories) <> 3 or (select count(*) from public.products) <> 6
    or (select count(*) from public.product_variants) <> 7 or (select count(*) from public.ingredients) <> 13
    or (select count(*) from public.recipes) <> 7 or (select count(*) from public.product_prices) <> 7 then
    raise exception 'Seed dataset is incomplete';
  end if;
  if (select estimated_cost_cents from public.recipes r join public.product_variants v on v.id = r.variant_id
      join public.products p on p.id = v.product_id where p.name = 'Café Latte' and v.name = 'Hot · 12 oz') is distinct from 3483 then
    raise exception 'Authoritative recipe costing is incorrect';
  end if;
  if (select count(*) from public.recipes where cost_status = 'unavailable') <> 1 then
    raise exception 'Missing cost example was lost';
  end if;
end $$;
do $$begin
  if (select count(*) from public.suppliers)<>3 or (select count(*) from public.purchases)<>3 or (select count(*) from public.startup_budgets)<>5
    or (select count(*) from public.founder_contributions where status='pending')<>3 or (select count(*) from public.expenses where status='pending')<>2 then raise exception 'Extended preparation seed incomplete';end if;
  if exists(select 1 from public.orders) or exists(select 1 from public.stock_movements) or exists(select 1 from public.founder_contributions where status='confirmed') then raise exception 'Preparation seed fabricated operational activity';end if;
end $$;
-- A rerun must not reset edits, duplicate versions, or create more audit records.
select public.publish_product_price(:'seeded_shop', (select id from public.product_variants limit 1), 12345);
select count(*) as audit_count from public.audit_logs \gset
\ir ../../supabase/seed.sql
select set_config('test.audit_count', :'audit_count', false);
do $$ begin
  if (select count(*) from public.audit_logs) <> current_setting('test.audit_count')::int
    or (select count(*) from public.product_prices) <> 8 then raise exception 'Rerun changed existing records'; end if;
end $$;
-- An unrelated shop and a genuine category must survive cleanup.
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000002');
set request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select public.create_shop('Unrelated shop') as other_shop \gset
select public.create_menu_category(:'other_shop', 'Real category');
select set_config('test.seeded_shop', :'seeded_shop', false);
do $$ begin
  begin perform pg_temp.seed_preopening(); raise exception 'Ambiguous shop was selected';
  exception when raise_exception then if sqlerrm <> 'Specify a shop UUID: expected exactly one pre-opening shop with an active founder.' then raise; end if; end;
  begin perform pg_temp.seed_preopening(null, '10000000-0000-4000-8000-000000000099'); raise exception 'Unknown founder was accepted';
  exception when raise_exception then if sqlerrm <> 'Specify a shop UUID: expected exactly one pre-opening shop with an active founder.' then raise; end if; end;
  begin perform pg_temp.seed_preopening((select id from public.shops where name = 'Unrelated shop')); raise exception 'Nonempty menu was seeded';
  exception when raise_exception then if sqlerrm <> 'Seed requires an empty menu and ingredient list. Existing records were preserved.' then raise; end if; end;
end $$;
-- Configure cleanup explicitly now that two shops exist.
select set_config('csms.seed_shop_id', :'seeded_shop', false);
\ir ../../supabase/reset-preopening-seed.sql
do $$ begin
  if (select count(*) from public.shops) <> 2 or (select count(*) from public.profiles) <> 2
    or (select count(*) from public.shop_members) <> 2 then raise exception 'Cleanup deleted identity records'; end if;
  if (select count(*) from public.categories) <> 1 or not exists(select 1 from public.categories where name = 'Real category') then
    raise exception 'Cleanup affected unrelated records'; end if;
  if exists(select 1 from public.products) or exists(select 1 from public.ingredients) or exists(select 1 from public.recipes)
    or exists(select 1 from public.product_prices) then raise exception 'Cleanup left sample configuration'; end if;
  if exists(select 1 from pg_trigger where tgname in ('immutable_prices','immutable_recipes','immutable_recipe_items','immutable_audit')
    and tgenabled <> 'O') then raise exception 'Cleanup weakened history protections'; end if;
  if not exists(select 1 from public.audit_logs where action = 'seed.preopening_removed') then raise exception 'Cleanup was not audited'; end if;
end $$;
-- Repeat cleanup is harmless; cleared samples can be seeded again.
\ir ../../supabase/reset-preopening-seed.sql
-- Simulate a failed recipe insert after categories, ingredients and prices were
-- written. The enclosing statement must roll every sample record back.
create function pg_temp.fail_seed_recipe() returns trigger language plpgsql as $$
begin raise exception 'Injected seed failure'; end $$;
create trigger fail_seed_recipe before insert on public.recipes for each row execute function pg_temp.fail_seed_recipe();
do $$ begin
  begin perform pg_temp.seed_preopening(current_setting('test.seeded_shop')::uuid); raise exception 'Injected failure was ignored';
  exception when raise_exception then if sqlerrm <> 'Injected seed failure' then raise; end if; end;
  if exists(select 1 from public.categories where shop_id = current_setting('test.seeded_shop')::uuid)
    or exists(select 1 from public.ingredients) or exists(select 1 from public.product_prices) then
    raise exception 'Failed seed left partial records'; end if;
end $$;
drop trigger fail_seed_recipe on public.recipes;
\ir ../../supabase/seed.sql
-- A future table can block cleanup after history triggers were disabled.
-- Verify rollback restores data AND trigger definitions in that case.
create table public.future_order_reference(price_id uuid references public.product_prices(id));
insert into future_order_reference select id from public.product_prices limit 1;
do $$ begin
  begin perform pg_temp.reset_preopening(current_setting('test.seeded_shop')::uuid); raise exception 'Referenced prices were deleted';
  exception when foreign_key_violation then null; end;
  if (select count(*) from public.recipes) <> 7 or (select count(*) from public.product_prices) <> 7
    or exists(select 1 from pg_trigger where tgname in ('immutable_prices','immutable_recipes','immutable_recipe_items') and tgenabled <> 'O') then
    raise exception 'Failed cleanup left partial deletes or disabled history triggers'; end if;
end $$;
drop table future_order_reference;
-- A real recipe referring to sample ingredients blocks cleanup atomically.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false);
select public.create_menu_category(:'seeded_shop', 'Real drinks') as real_cat \gset
select public.create_menu_product(:'seeded_shop', :'real_cat', 'Real drink', 'Regular', 10000) as real_product \gset
select public.publish_recipe(:'seeded_shop', (select id from public.product_variants where product_id = :'real_product'),
  jsonb_build_array(jsonb_build_object('ingredient_id', (select id from public.ingredients limit 1), 'quantity', '1', 'waste_bps', 0)));
do $$ begin
  begin perform pg_temp.reset_preopening(current_setting('test.seeded_shop')::uuid); raise exception 'Shared sample ingredients were deleted';
  exception when raise_exception then if sqlerrm <> 'Sample records are referenced by non-sample configuration. Cleanup refused.' then raise; end if; end;
  if (select count(*) from public.products) <> 7 then raise exception 'Failed cleanup was not atomic'; end if;
end $$;
-- Operating shops are never eligible, even with an explicit UUID.
update public.shops set setup_state = 'operating' where id = :'seeded_shop';
do $$ begin
  begin perform pg_temp.seed_preopening(current_setting('test.seeded_shop')::uuid); raise exception 'Operating shop was seeded';
  exception when raise_exception then if sqlerrm <> 'Specify a shop UUID: expected exactly one pre-opening shop with an active founder.' then raise; end if; end;
  begin perform pg_temp.reset_preopening(current_setting('test.seeded_shop')::uuid); raise exception 'Operating shop was cleared';
  exception when raise_exception then if sqlerrm <> 'Specify a shop UUID: cleanup requires exactly one pre-opening shop.' then raise; end if; end;
end $$;
\echo 'PASS: database seed, idempotency, atomic failure, scoped cleanup and retained history protection'
