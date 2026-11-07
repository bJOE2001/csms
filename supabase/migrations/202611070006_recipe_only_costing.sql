begin;
-- Retain historical columns and snapshots; retire their use as a selling fallback.
alter function public.pos_checkout(uuid,jsonb) rename to pos_checkout_with_inventory;
revoke all on function public.pos_checkout_with_inventory(uuid,jsonb) from public,anon,authenticated;
create function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare line jsonb;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((p_data->>'id'),0));
 -- Already completed requests retain their original idempotent replay semantics.
 if exists(select 1 from public.pos_sales where id=(p_data->>'id')::uuid) then return public.pos_checkout_with_inventory(p_shop_id,p_data);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 for line in select value from jsonb_array_elements(p_data->'items') loop
  if not exists(select 1 from public.pos_inventory_configs where shop_id=p_shop_id and product_id=(line->>'product_id')::uuid and size_key=coalesce(line->>'size_id','') and active_recipe_id is not null) then
   raise exception 'Inventory recipe required before this product can be sold.';
  end if;
 end loop;
 return public.pos_checkout_with_inventory(p_shop_id,p_data);
end $$;
alter function public.pos_save_product(uuid,jsonb) rename to pos_save_product_compatibility;
revoke all on function public.pos_save_product_compatibility(uuid,jsonb) from public,anon,authenticated;
create function public.pos_save_product(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare stored public.pos_products; sizes jsonb; s jsonb; previous jsonb; normalized jsonb:=p_data;
begin
 perform public.require_business_access(p_shop_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if p_data ? 'cost_cents' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'sizes','[]')) x where x ? 'cost_cents') then raise exception 'Preparation costs are calculated from inventory recipes.';end if;
 select * into stored from public.pos_products where shop_id=p_shop_id and id=(p_data->>'id')::uuid for update;
 sizes:='[]';
 for s in select value from jsonb_array_elements(coalesce(p_data->'sizes',stored.sizes,'[]')) loop
  select value into previous from jsonb_array_elements(coalesce(stored.sizes,'[]')) where value->>'id'=s->>'id';
  sizes:=sizes||jsonb_build_array(s||jsonb_build_object('cost_cents',previous->'cost_cents'));
 end loop;
 normalized:=normalized||jsonb_build_object('cost_cents',stored.cost_cents,'sizes',sizes);
 return public.pos_save_product_compatibility(p_shop_id,normalized);
end $$;
revoke all on function public.pos_record_cost(uuid,jsonb) from authenticated;
-- Item creation and optional initial stock are one transaction and one retryable operation.
create function public.pos_inventory_create_item(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare initial jsonb:=p_data->'initial_stock'; item jsonb; replay jsonb; op uuid:=(initial->>'operation_id')::uuid;
begin
 perform public.require_business_access(p_shop_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if initial is null then return public.pos_inventory_save_item(p_shop_id,p_data);end if;
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.create',p_data);if replay is not null then return replay;end if;
 if exists(select 1 from public.ingredients where id=(p_data->>'id')::uuid) then raise exception 'Initial stock is only available when creating an item.';end if;
 item:=public.pos_inventory_save_item(p_shop_id,p_data-'initial_stock');
 perform public.pos_inventory_post(p_shop_id,jsonb_build_object('operation_id',md5(op::text||':stock')::uuid,'ingredient_id',p_data->>'id','kind','opening','quantity',initial->>'quantity','purchase_unit',p_data->>'base_unit','total_cost_cents',initial->'total_cost_cents','occurred_on',initial->>'occurred_on','reason','Initial stock'));
 return public.finish_business_operation(p_shop_id,op,item);
end $$;
revoke all on function public.pos_checkout(uuid,jsonb),public.pos_save_product(uuid,jsonb),public.pos_inventory_create_item(uuid,jsonb) from public,anon;
grant execute on function public.pos_checkout(uuid,jsonb),public.pos_save_product(uuid,jsonb),public.pos_inventory_create_item(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
