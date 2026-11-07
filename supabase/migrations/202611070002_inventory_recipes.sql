begin;
alter table public.pos_products add constraint pos_products_shop_identity unique(shop_id,id);
create table public.pos_recipe_versions (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null, product_id uuid not null, size_id uuid,
 version integer not null check(version>0), mode text not null check(mode in ('recipe','finished_good')),
 components jsonb not null check(jsonb_typeof(components)='array'), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(shop_id,id),
 foreign key(shop_id,product_id) references public.pos_products(shop_id,id)
);
create unique index pos_recipe_version on public.pos_recipe_versions(product_id,coalesce(size_id::text,''),version);
create table public.pos_inventory_configs (
 shop_id uuid not null, product_id uuid not null, size_key text not null,
 active_recipe_id uuid, draft_recipe_id uuid, revision bigint not null default 0,
 primary key(shop_id,product_id,size_key), foreign key(shop_id,product_id) references public.pos_products(shop_id,id),
 foreign key(shop_id,active_recipe_id) references public.pos_recipe_versions(shop_id,id),
 foreign key(shop_id,draft_recipe_id) references public.pos_recipe_versions(shop_id,id)
);
create trigger immutable_pos_recipes before update or delete on public.pos_recipe_versions for each row execute function public.reject_history_change();
alter table public.pos_recipe_versions enable row level security;
alter table public.pos_inventory_configs enable row level security;
create policy pos_recipes_owner on public.pos_recipe_versions for select to authenticated using(public.is_shop_founder(shop_id));
create policy pos_recipe_configs_owner on public.pos_inventory_configs for select to authenticated using(public.is_shop_founder(shop_id));
revoke all on public.pos_recipe_versions,public.pos_inventory_configs from public,anon,authenticated;
grant select on public.pos_recipe_versions,public.pos_inventory_configs to authenticated;

create function public.pos_recipe_info(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object(
 'cost_cents',case when count(c.value)=0 or bool_or(unit_cost is null or not i.active) or ceil(sum((c.value->>'quantity')::numeric*unit_cost))>100000000 then null else ceil(sum((c.value->>'quantity')::numeric*unit_cost))::bigint end,
 'max_quantity',case when count(c.value)=0 or bool_or(unit_cost is null or not i.active) or ceil(sum((c.value->>'quantity')::numeric*unit_cost))>100000000 then 0 else greatest(0,least(100,floor(min(coalesce(b.quantity,0)/(c.value->>'quantity')::numeric)))) end,
 'components',coalesce(jsonb_agg(c.value||jsonb_build_object('name',i.name,'active',i.active,'quantity',(c.value->>'quantity'),'quantity_on_hand',coalesce(b.quantity,0)::text,'unit_cost_cents',unit_cost::text,'component_cost_cents',((c.value->>'quantity')::numeric*unit_cost)::text)) filter(where c.value is not null),'[]'))
 from public.pos_recipe_versions r left join lateral jsonb_array_elements(r.components) c(value) on true
 left join public.ingredients i on i.id=(c.value->>'ingredient_id')::uuid and i.shop_id=r.shop_id
 left join public.inventory_balances b on b.ingredient_id=i.id and b.shop_id=i.shop_id
 left join lateral(select case when b.quantity>0 then b.value_cents/b.quantity else i.estimated_unit_cost_cents end unit_cost) costs on true
 where r.id=p_id group by r.id;
$$;
create function public.pos_inventory_recipe_data(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_business_access(p_shop_id);
 return jsonb_build_object('configs',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('product_name',p.name,'active',public.pos_recipe_info(c.active_recipe_id),'draft',public.pos_recipe_info(c.draft_recipe_id))) from public.pos_inventory_configs c join public.pos_products p on p.id=c.product_id where c.shop_id=p_shop_id),'[]'));
end $$;
alter function public.pos_inventory_read(uuid,date,date) rename to pos_inventory_read_stock;
revoke all on function public.pos_inventory_read_stock(uuid,date,date) from public,anon,authenticated;
create function public.pos_inventory_read(p_shop_id uuid,p_from date,p_to date) returns jsonb language sql stable security definer set search_path='' as $$
 select public.pos_inventory_read_stock(p_shop_id,p_from,p_to)||public.pos_inventory_recipe_data(p_shop_id);
$$;

create function public.pos_inventory_recipe(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; prod public.pos_products; cfg public.pos_inventory_configs; comp jsonb; item public.ingredients;
 v_size_id uuid:=(p_data->>'size_id')::uuid; v_product_id uuid:=(p_data->>'product_id')::uuid; action text:=p_data->>'action'; mode text:=p_data->>'mode';
 quantity numeric; parts jsonb:='[]'; ids uuid[]:='{}'; recipe_id uuid; next_version integer; replay jsonb; info jsonb;
begin
 perform public.require_business_access(p_shop_id);
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.recipe',p_data);if replay is not null then return replay;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 select * into prod from public.pos_products where shop_id=p_shop_id and id=v_product_id and archived_at is null for update;
 if not found then raise exception 'Product not found';end if;
 if (jsonb_array_length(prod.sizes)=0 and v_size_id is not null) or (jsonb_array_length(prod.sizes)>0 and not exists(select 1 from jsonb_array_elements(prod.sizes) s where (s->>'id')::uuid=v_size_id)) then raise exception 'Choose a current product size';end if;
 insert into public.pos_inventory_configs(shop_id,product_id,size_key) values(p_shop_id,v_product_id,coalesce(v_size_id::text,'')) on conflict do nothing;
 select * into strict cfg from public.pos_inventory_configs c where c.shop_id=p_shop_id and c.product_id=prod.id and size_key=coalesce(v_size_id::text,'') for update;
 if (p_data->>'expected_revision')::bigint is distinct from cfg.revision then raise exception 'Recipe changed. Reopen it before saving.';end if;
 if action='draft' then
  if mode is null or mode not in ('recipe','finished_good') or jsonb_typeof(p_data->'components') is distinct from 'array' or jsonb_array_length(p_data->'components')>50 then raise exception 'Check inventory mode and recipe components';end if;
  for comp in select value from jsonb_array_elements(p_data->'components') loop
   select * into item from public.ingredients where shop_id=p_shop_id and id=(comp->>'ingredient_id')::uuid;
   if not found then raise exception 'Choose an existing inventory item';end if;
   quantity:=(comp->>'quantity')::numeric;
   if quantity is null or quantity<=0 or quantity>1000000 or quantity<>round(quantity,6) or (item.base_unit='each' and quantity<>trunc(quantity)) then raise exception 'Enter a positive component quantity in its base unit';end if;
   if item.id=any(ids) then raise exception 'Combine duplicate inventory components into one quantity';end if;ids:=array_append(ids,item.id);
   parts:=parts||jsonb_build_array(jsonb_build_object('ingredient_id',item.id,'name',item.name,'base_unit',item.base_unit,'quantity',quantity));
  end loop;
  select coalesce(max(version),0)+1 into next_version from public.pos_recipe_versions r where r.product_id=prod.id and r.size_id is not distinct from v_size_id;
  insert into public.pos_recipe_versions(shop_id,product_id,size_id,version,mode,components,created_by) values(p_shop_id,prod.id,v_size_id,next_version,mode,parts,auth.uid()) returning id into recipe_id;
  update public.pos_inventory_configs set draft_recipe_id=recipe_id,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 elsif action='activate' then
  if cfg.draft_recipe_id is null then raise exception 'Save a draft before activating inventory tracking';end if;
  info:=public.pos_recipe_info(cfg.draft_recipe_id);
  if jsonb_array_length(info->'components')=0 or info->>'cost_cents' is null then raise exception 'Recipe needs active inventory items with recorded costs before activation';end if;
  if info->>'mode'='finished_good' and exists(select 1 from jsonb_array_elements(info->'components') c join public.ingredients i on i.id=(c->>'ingredient_id')::uuid where i.item_type<>'finished_good') then raise exception 'Finished-good tracking can consume only finished-good inventory items';end if;
  update public.pos_inventory_configs set active_recipe_id=cfg.draft_recipe_id,draft_recipe_id=null,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 elsif action='deactivate' then
  update public.pos_inventory_configs set active_recipe_id=null,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 else raise exception 'Unknown recipe action';end if;
 perform public.record_business_audit(p_shop_id,'inventory.recipe.'||action,'pos_product',prod.id,p_data);
 return public.finish_business_operation(p_shop_id,op,jsonb_build_object('product_id',prod.id));
end $$;

create function public.pos_inventory_product_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.pos_inventory_configs; previous jsonb; next_size jsonb;
begin
 for cfg in select * from public.pos_inventory_configs where product_id=old.id and active_recipe_id is not null loop
  if cfg.size_key='' then
   if jsonb_array_length(new.sizes)>0 then raise exception 'Deactivate the regular recipe before adding sizes';end if;
   if old.cost_cents is distinct from new.cost_cents then raise exception 'Active preparation cost is calculated. Deactivate inventory tracking to edit the manual fallback.';end if;
  else
   select value into next_size from jsonb_array_elements(new.sizes) where value->>'id'=cfg.size_key;
   if next_size is null then raise exception 'Deactivate the size recipe before removing this size';end if;
   select value into previous from jsonb_array_elements(old.sizes) where value->>'id'=cfg.size_key;
   if previous->'cost_cents' is distinct from next_size->'cost_cents' then raise exception 'Active size cost is calculated. Deactivate inventory tracking to edit the manual fallback.';end if;
  end if;
 end loop; return new;
end $$;
create trigger pos_inventory_product_guard before update on public.pos_products for each row execute function public.pos_inventory_product_guard();
create function public.pos_inventory_unit_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.base_unit<>old.base_unit and exists(select 1 from public.pos_recipe_versions r cross join lateral jsonb_array_elements(r.components) c where (c->>'ingredient_id')::uuid=old.id) then raise exception 'Base unit cannot change after recipe use';end if;
 return new;
end $$;
create trigger pos_inventory_unit_guard before update on public.ingredients for each row execute function public.pos_inventory_unit_guard();

create function public.pos_inventory_catalog(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 select coalesce(jsonb_object_agg(product_id,variants),'{}') into result from (
 select product_id,jsonb_object_agg(case when size_key='' then 'regular' else size_key end,
 jsonb_build_object('state',case when active_recipe_id is not null then 'active' when draft_recipe_id is not null then 'draft' else 'not_configured' end,'mode',coalesce(a->>'mode',d->>'mode'),
 'max_quantity',case when active_recipe_id is not null then a->'max_quantity' else null end)||
 case when public.is_shop_founder(p_shop_id) then jsonb_build_object('cost_cents',a->'cost_cents') else '{}'::jsonb end) variants
 from public.pos_inventory_configs c left join lateral(select public.pos_recipe_info(c.active_recipe_id) a,public.pos_recipe_info(c.draft_recipe_id) d) info on true
 where shop_id=p_shop_id group by product_id) grouped;
 return result;
end $$;
revoke all on function public.pos_recipe_info(uuid),public.pos_inventory_product_guard(),public.pos_inventory_unit_guard() from public,anon,authenticated;
revoke all on function public.pos_inventory_read(uuid,date,date),public.pos_inventory_recipe_data(uuid),public.pos_inventory_recipe(uuid,jsonb),public.pos_inventory_catalog(uuid) from public,anon;
grant execute on function public.pos_inventory_read(uuid,date,date),public.pos_inventory_recipe_data(uuid),public.pos_inventory_recipe(uuid,jsonb),public.pos_inventory_catalog(uuid) to authenticated;
commit;
