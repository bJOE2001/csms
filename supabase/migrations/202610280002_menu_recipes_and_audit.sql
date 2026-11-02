-- All publication functions run atomically. Browser roles cannot write history tables.
create type public.ingredient_unit as enum ('g', 'ml', 'each');
create type public.recipe_cost_status as enum ('estimated', 'unavailable');

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_shop_time_idx on public.audit_logs(shop_id, created_at desc);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (shop_id, id)
);
create unique index categories_shop_name_idx on public.categories(shop_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  category_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  foreign key (shop_id, category_id) references public.categories(shop_id, id)
);
create index products_shop_category_idx on public.products(shop_id, category_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  product_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  available boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (product_id, name),
  foreign key (shop_id, product_id) references public.products(shop_id, id)
);
create index product_variants_shop_product_idx on public.product_variants(shop_id, product_id);

create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  variant_id uuid not null,
  version integer not null check (version > 0),
  price_cents bigint not null check (price_cents between 0 and 9007199254740991),
  created_by uuid not null references auth.users(id),
  effective_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (variant_id, version),
  foreign key (shop_id, variant_id) references public.product_variants(shop_id, id)
);
create index product_prices_shop_variant_idx on public.product_prices(shop_id, variant_id, version desc);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(trim(name)) between 1 and 120),
  base_unit public.ingredient_unit not null,
  estimated_unit_cost_cents numeric(18,6) check (estimated_unit_cost_cents between 0 and 999999999999.999999),
  minimum_stock numeric(18,6) not null default 0 check (minimum_stock between 0 and 999999999999.999999),
  created_at timestamptz not null default now(),
  unique (shop_id, id)
);
create unique index ingredients_shop_name_idx on public.ingredients(shop_id, lower(name));

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  variant_id uuid not null,
  version integer not null check (version > 0),
  cost_status public.recipe_cost_status not null,
  estimated_cost_cents bigint check (estimated_cost_cents between 0 and 9007199254740991),
  created_by uuid not null references auth.users(id),
  effective_at timestamptz not null default now(),
  unique (shop_id, id),
  unique (variant_id, version),
  foreign key (shop_id, variant_id) references public.product_variants(shop_id, id),
  check ((cost_status = 'estimated' and estimated_cost_cents is not null)
      or (cost_status = 'unavailable' and estimated_cost_cents is null))
);
create index recipes_shop_variant_idx on public.recipes(shop_id, variant_id, version desc);

create table public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  recipe_id uuid not null,
  ingredient_id uuid not null,
  ingredient_name_snapshot text not null,
  base_unit_snapshot public.ingredient_unit not null,
  quantity numeric(18,6) not null check (quantity > 0 and quantity < 1000000000000),
  waste_bps integer not null default 0 check (waste_bps between 0 and 10000),
  estimated_unit_cost_cents numeric(18,6) check (estimated_unit_cost_cents between 0 and 999999999999.999999),
  unique (recipe_id, ingredient_id),
  foreign key (shop_id, recipe_id) references public.recipes(shop_id, id),
  foreign key (shop_id, ingredient_id) references public.ingredients(shop_id, id)
);
create index recipe_items_shop_recipe_idx on public.recipe_items(shop_id, recipe_id);
create index recipe_items_ingredient_idx on public.recipe_items(shop_id, ingredient_id);

create function public.reject_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Historical records are immutable; publish a new version or record a correction.' using errcode = '55000';
end;
$$;
revoke all on function public.reject_history_change() from public, anon, authenticated;
create trigger immutable_prices before update or delete on public.product_prices for each row execute function public.reject_history_change();
create trigger immutable_recipes before update or delete on public.recipes for each row execute function public.reject_history_change();
create trigger immutable_recipe_items before update or delete on public.recipe_items for each row execute function public.reject_history_change();
create trigger immutable_audit before update or delete on public.audit_logs for each row execute function public.reject_history_change();

-- Authenticated callers have SELECT only, subject to RLS. All writes use functions below.
revoke all on public.categories, public.products, public.product_variants, public.product_prices,
  public.ingredients, public.recipes, public.recipe_items, public.audit_logs from public, anon, authenticated;
grant select on public.categories, public.products, public.product_variants, public.product_prices,
  public.ingredients, public.recipes, public.recipe_items, public.audit_logs to authenticated;

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_prices enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.audit_logs enable row level security;
create policy "Members read categories" on public.categories for select to authenticated using (public.is_shop_member(shop_id));
create policy "Members read products" on public.products for select to authenticated using (public.is_shop_member(shop_id));
create policy "Members read variants" on public.product_variants for select to authenticated using (public.is_shop_member(shop_id));
create policy "Members read price versions" on public.product_prices for select to authenticated using (public.is_shop_member(shop_id));
create policy "Founders read ingredient estimates" on public.ingredients for select to authenticated using (public.is_shop_founder(shop_id));
create policy "Founders read recipes and costing" on public.recipes for select to authenticated using (public.is_shop_founder(shop_id));
create policy "Founders read recipe ingredients" on public.recipe_items for select to authenticated using (public.is_shop_founder(shop_id));
create policy "Founders read audit" on public.audit_logs for select to authenticated using (public.is_shop_founder(shop_id));

create function public.create_menu_category(p_shop_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  insert into public.categories(shop_id, name) values (p_shop_id, trim(p_name)) returning id into v_id;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
  values (p_shop_id, auth.uid(), 'category.created', 'category', v_id, jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;

create function public.add_menu_variant(p_shop_id uuid, p_product_id uuid, p_name text, p_price_cents bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.products where shop_id = p_shop_id and id = p_product_id) then raise exception 'Product not found in this shop'; end if;
  insert into public.product_variants(shop_id, product_id, name) values (p_shop_id, p_product_id, trim(p_name)) returning id into v_id;
  insert into public.product_prices(shop_id, variant_id, version, price_cents, created_by) values (p_shop_id, v_id, 1, p_price_cents, auth.uid());
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
  values (p_shop_id, auth.uid(), 'variant.created', 'variant', v_id, jsonb_build_object('price_cents', p_price_cents, 'price_version', 1));
  return v_id;
end;
$$;

create function public.create_menu_product(p_shop_id uuid, p_category_id uuid, p_name text, p_variant_name text, p_price_cents bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  insert into public.products(shop_id, category_id, name) values (p_shop_id, p_category_id, trim(p_name)) returning id into v_id;
  perform public.add_menu_variant(p_shop_id, v_id, p_variant_name, p_price_cents);
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
  values (p_shop_id, auth.uid(), 'product.created', 'product', v_id, jsonb_build_object('name', trim(p_name)));
  return v_id;
end;
$$;

create function public.publish_product_price(p_shop_id uuid, p_variant_id uuid, p_price_cents bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_version integer;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  perform 1 from public.product_variants where id = p_variant_id and shop_id = p_shop_id for update;
  if not found then raise exception 'Variant not found in this shop'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.product_prices where variant_id = p_variant_id;
  insert into public.product_prices(shop_id, variant_id, version, price_cents, created_by)
    values (p_shop_id, p_variant_id, v_version, p_price_cents, auth.uid()) returning id into v_id;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (p_shop_id, auth.uid(), 'price.published', 'variant', p_variant_id, jsonb_build_object('price_id', v_id, 'version', v_version, 'price_cents', p_price_cents));
  return v_id;
end;
$$;

create function public.create_ingredient(p_shop_id uuid, p_name text, p_base_unit public.ingredient_unit,
  p_estimated_unit_cost_cents numeric, p_minimum_stock numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  if p_estimated_unit_cost_cents <> round(p_estimated_unit_cost_cents, 6) or p_minimum_stock <> round(p_minimum_stock, 6) then
    raise exception 'At most six decimal places are supported';
  end if;
  insert into public.ingredients(shop_id, name, base_unit, estimated_unit_cost_cents, minimum_stock)
    values (p_shop_id, trim(p_name), p_base_unit, p_estimated_unit_cost_cents, p_minimum_stock) returning id into v_id;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (p_shop_id, auth.uid(), 'ingredient.created', 'ingredient', v_id,
      jsonb_build_object('name', trim(p_name), 'base_unit', p_base_unit, 'estimated_unit_cost_cents', p_estimated_unit_cost_cents));
  return v_id;
end;
$$;

create function public.revise_ingredient_estimate(p_shop_id uuid, p_ingredient_id uuid, p_estimated_unit_cost_cents numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before numeric;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  if p_estimated_unit_cost_cents <> round(p_estimated_unit_cost_cents, 6) then raise exception 'At most six decimal places are supported'; end if;
  select estimated_unit_cost_cents into v_before from public.ingredients where shop_id = p_shop_id and id = p_ingredient_id for update;
  if not found then raise exception 'Ingredient not found in this shop'; end if;
  update public.ingredients set estimated_unit_cost_cents = p_estimated_unit_cost_cents where shop_id = p_shop_id and id = p_ingredient_id;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (p_shop_id, auth.uid(), 'ingredient.estimate_revised', 'ingredient', p_ingredient_id,
      jsonb_build_object('before_centavos_per_unit', v_before, 'after_centavos_per_unit', p_estimated_unit_cost_cents));
end;
$$;

create function public.publish_recipe(p_shop_id uuid, p_variant_id uuid, p_items jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid(); v_version integer; v_item jsonb; v_ingredient public.ingredients%rowtype;
  v_total numeric := 0; v_available boolean := true; v_quantity numeric; v_waste integer;
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Recipe items must be an array'; end if;
  if jsonb_array_length(p_items) not between 1 and 64 then raise exception 'Recipe needs 1 to 64 ingredients'; end if;
  perform 1 from public.product_variants where id = p_variant_id and shop_id = p_shop_id for update;
  if not found then raise exception 'Variant not found in this shop'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.recipes where variant_id = p_variant_id;

  -- Validate and compute from locked ingredient records; no client cost total is trusted.
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'ingredient_id' loop
    if (v_item->>'quantity') is null or (v_item->>'quantity') !~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
      or (v_item->>'waste_bps') is null or (v_item->>'waste_bps') !~ '^[0-9]{1,5}$' then raise exception 'Invalid recipe quantity or waste allowance'; end if;
    v_quantity := (v_item->>'quantity')::numeric;
    v_waste := (v_item->>'waste_bps')::integer;
    if v_quantity <= 0 or v_waste not between 0 and 10000 then raise exception 'Invalid quantity or waste allowance'; end if;
    select * into v_ingredient from public.ingredients where shop_id = p_shop_id and id = (v_item->>'ingredient_id')::uuid for share;
    if not found then raise exception 'Ingredient not found in this shop'; end if;
    v_available := v_available and v_ingredient.estimated_unit_cost_cents is not null;
    v_total := v_total + coalesce(v_ingredient.estimated_unit_cost_cents, 0) * v_quantity * (10000 + v_waste) / 10000;
  end loop;
  insert into public.recipes(id, shop_id, variant_id, version, cost_status, estimated_cost_cents, created_by)
  values (v_id, p_shop_id, p_variant_id, v_version,
    case when v_available then 'estimated'::public.recipe_cost_status else 'unavailable'::public.recipe_cost_status end,
    case when v_available then ceil(v_total)::bigint else null end, auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.recipe_items(shop_id, recipe_id, ingredient_id, ingredient_name_snapshot, base_unit_snapshot, quantity, waste_bps, estimated_unit_cost_cents)
    select p_shop_id, v_id, i.id, i.name, i.base_unit, (v_item->>'quantity')::numeric, (v_item->>'waste_bps')::integer, i.estimated_unit_cost_cents
      from public.ingredients i where i.shop_id = p_shop_id and i.id = (v_item->>'ingredient_id')::uuid;
  end loop;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (p_shop_id, auth.uid(), 'recipe.published', 'variant', p_variant_id, jsonb_build_object('recipe_id', v_id, 'version', v_version, 'cost_status', case when v_available then 'estimated' else 'unavailable' end));
  return v_id;
end;
$$;

create function public.set_variant_available(p_shop_id uuid, p_variant_id uuid, p_available boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_shop_founder(p_shop_id) then raise exception 'Founder access required' using errcode = '42501'; end if;
  if p_available and not exists (select 1 from public.recipes where shop_id = p_shop_id and variant_id = p_variant_id) then
    raise exception 'Publish a recipe before enabling this variant';
  end if;
  update public.product_variants set available = p_available where shop_id = p_shop_id and id = p_variant_id;
  if not found then raise exception 'Variant not found in this shop'; end if;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (p_shop_id, auth.uid(), 'variant.availability_changed', 'variant', p_variant_id, jsonb_build_object('available', p_available));
end;
$$;

revoke all on function public.create_menu_category(uuid, text), public.add_menu_variant(uuid, uuid, text, bigint),
  public.create_menu_product(uuid, uuid, text, text, bigint), public.publish_product_price(uuid, uuid, bigint),
  public.create_ingredient(uuid, text, public.ingredient_unit, numeric, numeric), public.publish_recipe(uuid, uuid, jsonb),
  public.revise_ingredient_estimate(uuid, uuid, numeric),
  public.set_variant_available(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_menu_category(uuid, text), public.add_menu_variant(uuid, uuid, text, bigint),
  public.create_menu_product(uuid, uuid, text, text, bigint), public.publish_product_price(uuid, uuid, bigint),
  public.create_ingredient(uuid, text, public.ingredient_unit, numeric, numeric), public.publish_recipe(uuid, uuid, jsonb),
  public.revise_ingredient_estimate(uuid, uuid, numeric),
  public.set_variant_available(uuid, uuid, boolean) to authenticated;
