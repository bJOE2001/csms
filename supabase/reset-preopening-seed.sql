-- ADMIN-ONLY, DESTRUCTIVE TO SEEDED SAMPLES (including subsequent price/recipe edits).
-- Run manually in Supabase SQL Editor before entering genuine configuration.
-- Preserves Auth accounts, shops, membership, non-sample devices, unrelated data and audit history.
begin;
set local lock_timeout = '10s';
-- If multiple shops exist, uncomment and set the same shop used by seed.sql:
-- select set_config('csms.seed_shop_id', 'YOUR-SHOP-UUID', true);

create or replace function pg_temp.reset_preopening(p_shop uuid default null)
returns jsonb language plpgsql as $$
declare
  v_shop uuid; v_candidates uuid[]; v_seed public.audit_logs%rowtype;
  v_categories uuid[]; v_products uuid[]; v_variants uuid[]; v_ingredients uuid[];
  v_extra jsonb;v_suppliers uuid[];v_purchases uuid[];v_budgets uuid[];v_funding uuid[];v_expenses uuid[];v_devices uuid[];
begin
  lock table public.shops, public.shop_members, public.categories, public.products,
    public.product_variants, public.product_prices, public.ingredients, public.recipes,
    public.recipe_items, public.audit_logs in share row exclusive mode;
  select array_agg(id) into v_candidates from public.shops
    where setup_state = 'pre_opening' and (p_shop is null or id = p_shop);
  if coalesce(cardinality(v_candidates), 0) <> 1 then
    raise exception 'Specify a shop UUID: cleanup requires exactly one pre-opening shop.';
  end if;
  v_shop := v_candidates[1];
  select a.* into v_seed from public.audit_logs a where a.shop_id = v_shop
    and a.action = 'seed.preopening_applied' and a.context->>'seed' = 'csms-preopening-v1'
    and not exists(select 1 from public.audit_logs r where r.shop_id = v_shop
      and r.action = 'seed.preopening_removed' and r.context->>'seed_run_id' = a.entity_id::text);
  if not found then return jsonb_build_object('status', 'nothing_to_remove', 'shop_id', v_shop); end if;
  select context into v_extra from public.audit_logs where shop_id=v_shop and action='seed.preopening_extended' and entity_id=v_seed.entity_id;
  if v_extra is not null then
    lock table public.suppliers,public.purchases,public.purchase_items,public.startup_budgets,public.founder_contributions,public.expenses,public.pos_devices in share row exclusive mode;
    v_suppliers:=array(select jsonb_array_elements_text(v_extra->'supplier_ids'))::uuid[];
    v_purchases:=array(select jsonb_array_elements_text(v_extra->'purchase_ids'))::uuid[];
    v_budgets:=array(select jsonb_array_elements_text(v_extra->'budget_ids'))::uuid[];
    v_funding:=array(select jsonb_array_elements_text(v_extra->'funding_ids'))::uuid[];
    v_expenses:=array(select jsonb_array_elements_text(v_extra->'expense_ids'))::uuid[];
    v_devices:=array(select jsonb_array_elements_text(v_extra->'device_ids'))::uuid[];
    if cardinality(v_suppliers)<>3 or cardinality(v_purchases)<>3 or cardinality(v_budgets)<>5 or cardinality(v_funding)<>3 or cardinality(v_expenses)<>2 or cardinality(v_devices)<>1 then raise exception 'Invalid extended seed manifest';end if;
    if exists(select 1 from public.purchases where id=any(v_purchases) and status not in('planned','ordered','cancelled'))
      or exists(select 1 from public.purchase_items where purchase_id=any(v_purchases) and received_quantity<>0)
      or exists(select 1 from public.expenses where id=any(v_expenses) and status not in('pending','rejected'))
      or exists(select 1 from public.founder_contributions where id=any(v_funding) and status not in('pending','rejected')) then
      raise exception 'Sample records were confirmed or received. Cleanup refused; use a clean production project.';end if;
    alter table public.expenses disable trigger no_delete_expenses;
    alter table public.founder_contributions disable trigger no_delete_funding;
    delete from public.expenses where shop_id=v_shop and id=any(v_expenses);
    delete from public.founder_contributions where shop_id=v_shop and id=any(v_funding);
    alter table public.expenses enable trigger no_delete_expenses;
    alter table public.founder_contributions enable trigger no_delete_funding;
    delete from public.purchase_items where shop_id=v_shop and purchase_id=any(v_purchases);
    delete from public.purchases where shop_id=v_shop and id=any(v_purchases);
    delete from public.suppliers where shop_id=v_shop and id=any(v_suppliers);
    delete from public.startup_budgets where shop_id=v_shop and id=any(v_budgets);
    delete from public.pos_devices where shop_id=v_shop and id=any(v_devices);
  end if;
  v_categories := array(select jsonb_array_elements_text(v_seed.context->'category_ids'))::uuid[];
  v_products := array(select jsonb_array_elements_text(v_seed.context->'product_ids'))::uuid[];
  v_variants := array(select jsonb_array_elements_text(v_seed.context->'variant_ids'))::uuid[];
  v_ingredients := array(select jsonb_array_elements_text(v_seed.context->'ingredient_ids'))::uuid[];
  if cardinality(v_categories) <> 3 or cardinality(v_products) <> 6
    or cardinality(v_variants) <> 7 or cardinality(v_ingredients) <> 13 then
    raise exception 'Seed manifest is invalid. Cleanup refused.';
  end if;
  -- Never silently remove genuine configuration linked to seeded roots.
  if exists(select 1 from public.products where category_id = any(v_categories) and not(id = any(v_products)))
    or exists(select 1 from public.product_variants where product_id = any(v_products) and not(id = any(v_variants)))
    or exists(select 1 from public.recipe_items i join public.recipes r on r.id = i.recipe_id
      where i.ingredient_id = any(v_ingredients) and not(r.variant_id = any(v_variants))) then
    raise exception 'Sample records are referenced by non-sample configuration. Cleanup refused.';
  end if;
  -- Narrow administrator exception for sample configuration only. Transactional DDL
  -- restores these triggers on any failure; normal browser roles cannot do this.
  alter table public.recipe_items disable trigger immutable_recipe_items;
  alter table public.recipes disable trigger immutable_recipes;
  alter table public.product_prices disable trigger immutable_prices;
  delete from public.recipe_items where shop_id = v_shop and recipe_id in
    (select id from public.recipes where shop_id = v_shop and variant_id = any(v_variants));
  delete from public.recipes where shop_id = v_shop and variant_id = any(v_variants);
  delete from public.product_prices where shop_id = v_shop and variant_id = any(v_variants);
  delete from public.product_variants where shop_id = v_shop and id = any(v_variants);
  delete from public.products where shop_id = v_shop and id = any(v_products);
  delete from public.categories where shop_id = v_shop and id = any(v_categories);
  delete from public.ingredients where shop_id = v_shop and id = any(v_ingredients);
  alter table public.recipe_items enable trigger immutable_recipe_items;
  alter table public.recipes enable trigger immutable_recipes;
  alter table public.product_prices enable trigger immutable_prices;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (v_shop, null, 'seed.preopening_removed', 'seed', gen_random_uuid(),
      jsonb_build_object('seed', 'csms-preopening-v1', 'seed_run_id', v_seed.entity_id, 'database_role', current_user));
  return jsonb_build_object('status', 'removed', 'shop_id', v_shop, 'seed_run_id', v_seed.entity_id);
end;
$$;
select pg_temp.reset_preopening(nullif(current_setting('csms.seed_shop_id', true), '')::uuid) as cleanup_result;
commit;
