begin;
-- Additive refinements for owner inventory onboarding, active recipe cost
-- breakdowns in Menu Management, and audited item classification updates.

create or replace function public.pos_inventory_save_item(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 previous_item public.ingredients;
 item public.ingredients;
 was_found boolean:=false;
 item_id uuid:=(p_data->>'id')::uuid;
 unit public.ingredient_unit:=(p_data->>'base_unit')::public.ingredient_unit;
 v_type text:=p_data->>'item_type';
 threshold numeric:=(p_data->>'minimum_stock')::numeric;
begin
 perform public.require_business_access(p_shop_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if item_id is null or length(trim(p_data->>'name')) not between 1 and 120 or p_data->>'name' is null or unit is null or v_type is null or v_type not in ('ingredient','supply','finished_good') or threshold is null or threshold<0 or threshold>=1000000000000 or threshold<>round(threshold,6) or (unit='each' and threshold<>trunc(threshold)) or jsonb_typeof(p_data->'active') is distinct from 'boolean' then
  raise exception 'Check item name, unit, threshold and status';
 end if;
 select * into previous_item from public.ingredients where shop_id=p_shop_id and id=item_id for update;
 was_found:=found;
 if was_found and previous_item.base_unit<>unit and (
  exists(select 1 from public.stock_movements where ingredient_id=item_id)
  or exists(select 1 from public.recipe_items where ingredient_id=item_id)
  or exists(select 1 from public.pos_recipe_versions r cross join lateral jsonb_array_elements(r.components) c where r.shop_id=p_shop_id and (c->>'ingredient_id')::uuid=item_id)
 ) then
  raise exception 'Base unit cannot change after stock movements or recipe use';
 end if;
 if was_found and previous_item.item_type='finished_good' and v_type<>'finished_good' and exists(
  select 1 from public.pos_inventory_configs cfg
  join public.pos_recipe_versions r on r.id=cfg.active_recipe_id and r.shop_id=cfg.shop_id
  cross join lateral jsonb_array_elements(r.components) c
  where cfg.shop_id=p_shop_id and r.mode='finished_good' and (c->>'ingredient_id')::uuid=item_id
 ) then
  raise exception 'Deactivate finished-good product tracking before changing this item type';
 end if;
 insert into public.ingredients(id,shop_id,name,base_unit,minimum_stock,item_type,notes,active)
 values(item_id,p_shop_id,trim(p_data->>'name'),unit,threshold,v_type,coalesce(p_data->>'notes',''),(p_data->>'active')::boolean)
 on conflict(id) do update
  set name=excluded.name,base_unit=excluded.base_unit,minimum_stock=excluded.minimum_stock,item_type=excluded.item_type,notes=excluded.notes,active=excluded.active
  where ingredients.shop_id=p_shop_id
 returning * into item;
 if item.id is null then raise exception 'Inventory item belongs to another shop';end if;
 perform public.record_business_audit(
  p_shop_id,
  'inventory.item.saved',
  'ingredient',
  item.id,
  case when was_found then p_data||jsonb_build_object('before',to_jsonb(previous_item)) else p_data end
 );
 return to_jsonb(item);
exception when unique_violation then
 raise exception 'An inventory item with this name already exists';
end $$;

create or replace function public.pos_inventory_read_stock(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_access(p_shop_id);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select jsonb_build_object(
  'items',coalesce((
   select jsonb_agg(
    to_jsonb(i)||jsonb_build_object(
     'minimum_stock',i.minimum_stock::text,
     'quantity',coalesce(b.quantity,0)::text,
     'value_cents',coalesce(case when b.quantity=0 then 0 else b.value_cents end,case when b.ingredient_id is null then 0 end),
     'revision',coalesce(b.revision,0),
     'unit_cost_cents',case when b.quantity>0 then b.value_cents/b.quantity else i.estimated_unit_cost_cents end::text,
     'has_movements',exists(select 1 from public.stock_movements m where m.shop_id=i.shop_id and m.ingredient_id=i.id),
     'unit_locked',(
      exists(select 1 from public.stock_movements m where m.shop_id=i.shop_id and m.ingredient_id=i.id)
      or exists(select 1 from public.recipe_items r where r.ingredient_id=i.id)
      or exists(select 1 from public.pos_recipe_versions rv cross join lateral jsonb_array_elements(rv.components) c where rv.shop_id=i.shop_id and (c->>'ingredient_id')::uuid=i.id)
     )
    ) order by i.name
   )
   from public.ingredients i
   left join public.inventory_balances b on b.shop_id=i.shop_id and b.ingredient_id=i.id
   where i.shop_id=p_shop_id
  ),'[]'),
  'movements',coalesce((
   select jsonb_agg(row_data order by row_data->>'created_at' desc)
   from (
    select to_jsonb(m)||jsonb_build_object(
     'quantity_delta',m.quantity_delta::text,
     'previous_quantity',m.previous_quantity::text,
     'resulting_quantity',m.resulting_quantity::text,
     'name',i.name,
     'base_unit',i.base_unit,
     'occurred_on',coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date),
     'supplier',d.supplier,
     'reference',d.reference,
     'notes',d.notes,
     'purchase_unit',d.purchase_unit,
     'entered_quantity',d.entered_quantity::text
    ) row_data
    from public.stock_movements m
    join public.ingredients i on i.id=m.ingredient_id
    join public.shops s on s.id=m.shop_id
    left join public.pos_stock_documents d on d.id=m.source_id
    where m.shop_id=p_shop_id and coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date) between p_from and p_to
   ) history
  ),'[]')
 ) into result;
 return result;
end $$;

create or replace function public.pos_inventory_catalog(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 select coalesce(jsonb_object_agg(product_id,variants),'{}') into result from (
  select product_id,jsonb_object_agg(
   case when size_key='' then 'regular' else size_key end,
   jsonb_build_object(
    'state',case when active_recipe_id is not null then 'active' when draft_recipe_id is not null then 'draft' else 'not_configured' end,
    'mode',coalesce(a->>'mode',d->>'mode'),
    'max_quantity',case when active_recipe_id is not null then a->'max_quantity' else null end
   )||case when public.is_shop_founder(p_shop_id) then jsonb_build_object(
    'cost_cents',a->'cost_cents',
    'has_draft',(draft_recipe_id is not null),
    'components',case when active_recipe_id is not null then coalesce(a->'components','[]'::jsonb) else '[]'::jsonb end
   ) else '{}'::jsonb end
  ) variants
  from public.pos_inventory_configs c
  left join lateral(select public.pos_recipe_info(c.active_recipe_id) a,public.pos_recipe_info(c.draft_recipe_id) d) info on true
  where shop_id=p_shop_id group by product_id
 ) grouped;
 return result;
end $$;

revoke all on function public.pos_inventory_read_stock(uuid,date,date) from public,anon,authenticated;
revoke all on function public.pos_inventory_save_item(uuid,jsonb),public.pos_inventory_catalog(uuid) from public,anon;
grant execute on function public.pos_inventory_save_item(uuid,jsonb),public.pos_inventory_catalog(uuid) to authenticated;
commit;
