-- OPTIONAL sample data. Run the entire file in Supabase SQL Editor as postgres,
-- after migrations and founder shop setup. Never run automatically on deployment.
begin;
set local lock_timeout = '10s';
-- If multiple shops exist, uncomment and set the target UUID:
-- select set_config('csms.seed_shop_id', 'YOUR-SHOP-UUID', true);
-- Optional actor override (must be an active founder of that shop):
-- select set_config('csms.seed_founder_id', 'YOUR-FOUNDER-USER-UUID', true);

-- Temporary, invoker-only helper: no permanent function or public RPC is installed.
create or replace function pg_temp.seed_preopening(p_shop uuid default null, p_founder uuid default null)
returns jsonb language plpgsql as $$
declare
  v_shop uuid; v_actor uuid; v_candidates uuid[]; v_run uuid := gen_random_uuid();
  v_category uuid; v_product uuid; v_variant uuid; v_id uuid;
  v_categories jsonb := '{}'; v_ingredients jsonb := '{}';
  v_category_ids uuid[] := '{}'; v_product_ids uuid[] := '{}';
  v_variant_ids uuid[] := '{}'; v_ingredient_ids uuid[] := '{}';
  v_row jsonb; v_product_row jsonb; v_variant_row jsonb; v_items jsonb;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
begin
  -- Serialize seed/reset and ordinary configuration writes, including empty checks.
  lock table public.shops, public.shop_members, public.categories, public.products,
    public.product_variants, public.product_prices, public.ingredients, public.recipes,
    public.recipe_items, public.audit_logs in share row exclusive mode;
  select array_agg(s.id) into v_candidates from public.shops s
  where s.setup_state = 'pre_opening' and (p_shop is null or s.id = p_shop)
    and exists(select 1 from public.shop_members m where m.shop_id = s.id
      and m.role = 'founder' and m.status = 'active' and (p_founder is null or m.user_id = p_founder));
  if coalesce(cardinality(v_candidates), 0) <> 1 then
    raise exception 'Specify a shop UUID: expected exactly one pre-opening shop with an active founder.';
  end if;
  v_shop := v_candidates[1];
  perform set_config('csms.active_seed_shop',v_shop::text,true);
  select m.user_id into v_actor from public.shop_members m join public.shops s on s.id = m.shop_id
    where m.shop_id = v_shop and m.role = 'founder' and m.status = 'active'
      and (p_founder is null or m.user_id = p_founder)
    order by (m.user_id = s.created_by) desc, m.created_at, m.id limit 1;
  if exists(select 1 from public.audit_logs a where a.shop_id = v_shop and a.action = 'seed.preopening_applied'
    and a.context->>'seed' = 'csms-preopening-v1' and not exists(select 1 from public.audit_logs r
      where r.shop_id = v_shop and r.action = 'seed.preopening_removed' and r.context->>'seed_run_id' = a.entity_id::text)) then
    return jsonb_build_object('status', 'already_seeded', 'shop_id', v_shop);
  end if;
  if exists(select 1 from public.categories where shop_id = v_shop)
    or exists(select 1 from public.products where shop_id = v_shop)
    or exists(select 1 from public.ingredients where shop_id = v_shop) then
    raise exception 'Seed requires an empty menu and ingredient list. Existing records were preserved.';
  end if;
  -- Use the existing founder-checked publication functions for prices, recipes and audit.
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
  for v_row in select value from jsonb_array_elements('[
    ["coffee", "Espresso bar"], ["other", "Coffee-free"], ["pastry", "Pastries"]]'::jsonb) loop
    v_id := public.create_menu_category(v_shop, v_row->>1);
    v_categories := v_categories || jsonb_build_object(v_row->>0, v_id);
    v_category_ids := array_append(v_category_ids, v_id);
  end loop;
  -- Costs are centavos per base unit; thresholds are not recorded stock.
  for v_row in select value from jsonb_array_elements('[
    ["beans", "Espresso beans", "g", 60, 1000],
    ["milk", "Whole milk", "ml", 9, 4000],
    ["oat", "Oat milk", "ml", 16, 2000],
    ["chocolate", "Chocolate sauce", "g", 35, 500],
    ["vanilla", "Vanilla syrup", "ml", null, 500],
    ["matcha", "Matcha powder", "g", 220, 100],
    ["water", "Filtered water", "ml", 0.3, 5000],
    ["ice", "Ice", "g", 0.1, 3000],
    ["paper_cup", "Paper cup · 12 oz", "each", 550, 100],
    ["cold_cup", "Cold cup · 16 oz", "each", 650, 100],
    ["lid", "Cup lid", "each", 200, 200],
    ["croissant", "Butter croissant", "each", 4500, 12],
    ["bag", "Paper pastry bag", "each", 300, 50]]'::jsonb) loop
    v_id := public.create_ingredient(v_shop, v_row->>1, (v_row->>2)::public.ingredient_unit,
      (v_row->>3)::numeric, (v_row->>4)::numeric);
    v_ingredients := v_ingredients || jsonb_build_object(v_row->>0, v_id);
    v_ingredient_ids := array_append(v_ingredient_ids, v_id);
  end loop;
  for v_product_row in select value from jsonb_array_elements('[
    {"category":"coffee","name":"Americano","variants":[
      {"name":"Hot · 12 oz","price":11000,"items":[["beans","18",300],["water","180",0],["paper_cup","1",0],["lid","1",0]]}]},
    {"category":"coffee","name":"Café Latte","variants":[
      {"name":"Hot · 12 oz","price":14500,"items":[["beans","18",300],["milk","180",0],["paper_cup","1",0],["lid","1",0]]},
      {"name":"Iced · 16 oz","price":15500,"items":[["beans","18",300],["milk","180",0],["ice","120",0],["cold_cup","1",0],["lid","1",0]]}]},
    {"category":"coffee","name":"Mocha","variants":[
      {"name":"Hot · 12 oz","price":16500,"items":[["beans","18",300],["milk","150",0],["chocolate","25",0],["paper_cup","1",0],["lid","1",0]]}]},
    {"category":"coffee","name":"Vanilla Latte","variants":[
      {"name":"Hot · 12 oz","price":16000,"items":[["beans","18",300],["milk","180",0],["vanilla","20",0],["paper_cup","1",0],["lid","1",0]]}]},
    {"category":"other","name":"Matcha Latte","variants":[
      {"name":"Iced · 16 oz","price":17000,"items":[["matcha","3",200],["milk","180",0],["ice","120",0],["cold_cup","1",0],["lid","1",0]]}]},
    {"category":"pastry","name":"Butter Croissant","variants":[
      {"name":"One piece","price":9500,"items":[["croissant","1",0],["bag","1",0]]}]}]'::jsonb) loop
    v_category := (v_categories->>(v_product_row->>'category'))::uuid;
    v_product := null;
    for v_variant_row in select value from jsonb_array_elements(v_product_row->'variants') loop
      if v_product is null then
        v_product := public.create_menu_product(v_shop, v_category, v_product_row->>'name',
          v_variant_row->>'name', (v_variant_row->>'price')::bigint);
        v_product_ids := array_append(v_product_ids, v_product);
        select id into strict v_variant from public.product_variants where product_id = v_product;
      else
        v_variant := public.add_menu_variant(v_shop, v_product, v_variant_row->>'name', (v_variant_row->>'price')::bigint);
      end if;
      v_variant_ids := array_append(v_variant_ids, v_variant);
      select jsonb_agg(jsonb_build_object('ingredient_id', v_ingredients->>(value->>0),
        'quantity', value->>1, 'waste_bps', (value->>2)::int)) into v_items
        from jsonb_array_elements(v_variant_row->'items');
      perform public.publish_recipe(v_shop, v_variant, v_items);
      -- Leave all sample variants unavailable until the founder reviews them.
    end loop;
  end loop;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (v_shop, v_actor, 'seed.preopening_applied', 'seed', v_run, jsonb_build_object(
      'seed', 'csms-preopening-v1', 'category_ids', v_category_ids, 'product_ids', v_product_ids,
      'variant_ids', v_variant_ids, 'ingredient_ids', v_ingredient_ids));
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
  return jsonb_build_object('status', 'seeded', 'shop_id', v_shop, 'products', 6, 'variants', 7, 'ingredients', 13);
end;
$$;
select pg_temp.seed_preopening(
  nullif(current_setting('csms.seed_shop_id', true), '')::uuid,
  nullif(current_setting('csms.seed_founder_id', true), '')::uuid
) as seed_result;

-- The extended manifest is separate so rerunning this file safely upgrades an
-- earlier menu-only seed without changing its edited prices or recipe snapshots.
create or replace function pg_temp.seed_preopening_modules() returns jsonb language plpgsql as $$
declare v_shop uuid:=current_setting('csms.active_seed_shop')::uuid;v_seed public.audit_logs%rowtype;v_actor uuid;v_id uuid;v_supplier uuid;
  v_suppliers uuid[]:='{}';v_purchases uuid[]:='{}';v_budgets uuid[]:='{}';v_funding uuid[]:='{}';v_expenses uuid[]:='{}';v_devices uuid[]:='{}';
  v_row jsonb;v_previous_sub text:=current_setting('request.jwt.claim.sub',true);v_previous_claims text:=current_setting('request.jwt.claims',true);
begin
  lock table public.suppliers,public.purchases,public.purchase_items,public.startup_budgets,public.founder_contributions,public.expenses,public.pos_devices in share row exclusive mode;
  select a.* into strict v_seed from public.audit_logs a where a.shop_id=v_shop and a.action='seed.preopening_applied' and a.context->>'seed'='csms-preopening-v1'
    and not exists(select 1 from public.audit_logs r where r.shop_id=v_shop and r.action='seed.preopening_removed' and r.context->>'seed_run_id'=a.entity_id::text);
  if exists(select 1 from public.audit_logs where shop_id=v_shop and action='seed.preopening_extended' and entity_id=v_seed.entity_id) then return jsonb_build_object('status','already_seeded_modules','shop_id',v_shop);end if;
  select user_id into strict v_actor from public.shop_members where shop_id=v_shop and role='founder' and status='active'
    and (nullif(current_setting('csms.seed_founder_id',true),'') is null or user_id=nullif(current_setting('csms.seed_founder_id',true),'')::uuid) order by created_at,id limit 1;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  for v_row in select value from jsonb_array_elements('[
    ["Sample Roast Supply","orders@sample-roast.example","Espresso beans","5000","60"],
    ["Sample Dairy Wholesale","orders@sample-dairy.example","Whole milk","24000","9"],
    ["Sample Packaging Co.","orders@sample-packaging.example","Paper cup · 12 oz","200","550"]]'::jsonb) loop
    v_supplier:=(public.manage_inventory(v_shop,'supplier',jsonb_build_object('name',v_row->>0,'contact',v_row->>1),gen_random_uuid())->>'id')::uuid;
    v_suppliers:=array_append(v_suppliers,v_supplier);
    v_id:=(public.manage_inventory(v_shop,'purchase',jsonb_build_object('supplier_id',v_supplier,'reference','SAMPLE-PREOPENING-PLAN','status','planned',
      'items',jsonb_build_array(jsonb_build_object('ingredient_id',(select id from public.ingredients where shop_id=v_shop and name=v_row->>2),'quantity',v_row->>3,'unit_cost_cents',v_row->>4))),gen_random_uuid())->>'id')::uuid;
    v_purchases:=array_append(v_purchases,v_id);
  end loop;
  for v_row in select value from jsonb_array_elements('[
    ["Sample coffee equipment","equipment",10000000],["Sample fit-out","equipment",4000000],
    ["Sample permits","operating",1500000],["Sample opening inventory plan","inventory_asset",2000000],["Sample cash reserve","working_cash",2500000]]'::jsonb) loop
    v_id:=(public.manage_finance(v_shop,'budget',jsonb_build_object('name',v_row->>0,'classification',v_row->>1,'amount_cents',(v_row->>2)::bigint),gen_random_uuid())->>'id')::uuid;
    v_budgets:=array_append(v_budgets,v_id);
  end loop;
  for v_row in select value from jsonb_array_elements('[["capital",5000000],["loan",2500000],["reimbursable",1000000]]'::jsonb) loop
    v_id:=(public.manage_finance(v_shop,'funding',jsonb_build_object('founder_id',v_actor,'classification',v_row->>0,'amount_cents',(v_row->>1)::bigint,'method','sample_bank_transfer','reference','SAMPLE-NOT-CONFIRMED','occurred_on',current_date),gen_random_uuid())->>'id')::uuid;
    v_funding:=array_append(v_funding,v_id);
  end loop;
  for v_row in select value from jsonb_array_elements('[["Sample equipment invoice","equipment",10000000],["Sample opening rent invoice","operating",1500000]]'::jsonb) loop
    v_id:=(public.manage_finance(v_shop,'expense',jsonb_build_object('category',v_row->>0,'classification',v_row->>1,'amount_cents',(v_row->>2)::bigint,'occurred_on',current_date,'method','sample_bank_transfer','paid_by','Sample founder','description','SAMPLE ONLY — unverified example, do not approve as real spending.'),gen_random_uuid())->>'id')::uuid;
    v_expenses:=array_append(v_expenses,v_id);
  end loop;
  v_id:=(public.manage_settings(v_shop,'device','{"name":"Sample POS — configure before use","offline_capable":false}',gen_random_uuid())->>'id')::uuid;
  update public.pos_devices set enabled=false where id=v_id;v_devices:=array_append(v_devices,v_id);
  perform public.record_business_audit(v_shop,'seed.preopening_extended','seed',v_seed.entity_id,jsonb_build_object('seed','csms-preopening-v1',
    'supplier_ids',v_suppliers,'purchase_ids',v_purchases,'budget_ids',v_budgets,'funding_ids',v_funding,'expense_ids',v_expenses,'device_ids',v_devices));
  perform set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);perform set_config('request.jwt.claims',coalesce(v_previous_claims,''),true);
  return jsonb_build_object('status','seeded_modules','shop_id',v_shop,'suppliers',3,'planned_purchases',3,'budgets',5,'pending_funding',3,'pending_expenses',2,'disabled_devices',1);
end $$;
select pg_temp.seed_preopening_modules() as module_seed_result;
commit;
