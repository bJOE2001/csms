begin;
-- Extend the existing inventory dataset; never seed business-specific supplies.
alter table public.ingredients
 add column item_type text not null default 'ingredient' check(item_type in ('ingredient','supply','finished_good')),
 add column notes text not null default '' check(length(notes)<=1000),
 add column active boolean not null default true;
alter table public.inventory_balances add column revision bigint not null default 0;
create function public.pos_inventory_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1; return new; end $$;
create trigger inventory_revision before update on public.inventory_balances for each row execute function public.pos_inventory_revision();

create table public.pos_stock_documents (
 id uuid primary key, shop_id uuid not null references public.shops(id), ingredient_id uuid not null,
 kind text not null check(kind in ('opening','receipt','count','waste','correction')),
 occurred_on date not null, purchase_unit text, entered_quantity numeric(18,6) not null,
 purchase_cost_cents bigint check(purchase_cost_cents between 0 and 100000000000),
 supplier text not null default '' check(length(supplier)<=120), reference text not null default '' check(length(reference)<=120),
 reason text not null check(length(trim(reason)) between 1 and 500), notes text not null default '' check(length(notes)<=1000),
 expected_revision bigint, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id)
);
alter table public.stock_movements add column previous_quantity numeric(18,6), add column resulting_quantity numeric(18,6),
 add column previous_value_cents bigint, add column resulting_value_cents bigint;
create function public.pos_inventory_capture_movement() returns trigger language plpgsql set search_path='' as $$
declare b public.inventory_balances;
begin
 select * into strict b from public.inventory_balances where shop_id=new.shop_id and ingredient_id=new.ingredient_id;
 new.previous_quantity:=b.quantity-new.quantity_delta; new.resulting_quantity:=b.quantity;
 new.previous_value_cents:=b.value_cents-new.value_delta_cents; new.resulting_value_cents:=b.value_cents;
 return new;
end $$;
create trigger capture_inventory_movement before insert on public.stock_movements for each row execute function public.pos_inventory_capture_movement();
create trigger immutable_stock_documents before update or delete on public.pos_stock_documents for each row execute function public.reject_history_change();
alter table public.pos_stock_documents enable row level security;
create policy inventory_documents_owner on public.pos_stock_documents for select to authenticated using(public.is_shop_founder(shop_id));
revoke all on public.pos_stock_documents from public,anon,authenticated;
grant select on public.pos_stock_documents to authenticated;

-- Both old and current writers use the same balances and ledger. New commands do
-- not permit negative stock or a hidden cost override.
create function public.pos_inventory_move(p_shop uuid,p_item uuid,p_delta numeric,p_value bigint,p_kind text,p_source uuid,p_reason text,p_revalue boolean default false)
returns bigint language plpgsql security definer set search_path='' as $$
declare b public.inventory_balances; cost bigint; next_value bigint; unit public.ingredient_unit;
begin
 select base_unit into strict unit from public.ingredients where shop_id=p_shop and id=p_item;
 if p_delta is null or p_delta<>round(p_delta,6) or abs(p_delta)>=1000000000000 or (unit='each' and p_delta<>trunc(p_delta)) then raise exception 'Enter a valid quantity in the item base unit';end if;
 insert into public.inventory_balances(shop_id,ingredient_id,value_cents) values(p_shop,p_item,0) on conflict do nothing;
 select * into strict b from public.inventory_balances where shop_id=p_shop and ingredient_id=p_item for update;
 if b.quantity+p_delta<0 then raise exception 'Insufficient stock. Refresh Inventory or reduce the order.';end if;
 if p_revalue then
  if p_kind<>'count' or p_value is null or p_value<0 or (b.quantity+p_delta=0 and p_value<>0) then raise exception 'Check the actual value of the counted stock';end if;
  next_value:=p_value;cost:=p_value-b.value_cents;
 elsif p_delta<0 then
  cost:=case when b.value_cents is null or b.quantity<=0 then null when b.quantity+p_delta=0 then b.value_cents else least(b.value_cents,ceil(-p_delta*b.value_cents/b.quantity)::bigint) end;
  next_value:=case when b.quantity+p_delta=0 then 0 else b.value_cents-cost end;
 else
  if p_value is not null and p_value<0 then raise exception 'Invalid stock cost';end if;
  cost:=coalesce(p_value,case when p_delta=0 then 0 end);
  next_value:=case when p_delta=0 then b.value_cents when b.quantity=0 then p_value when b.quantity<0 then null else b.value_cents+p_value end;
 end if;
 if next_value>9007199254740991 then raise exception 'Stock value exceeds the supported reporting precision';end if;
 update public.inventory_balances set quantity=quantity+p_delta,value_cents=next_value,updated_at=clock_timestamp() where shop_id=p_shop and ingredient_id=p_item;
 if b.quantity+p_delta>0 and next_value is not null then
  if next_value/(b.quantity+p_delta)>999999999999.999999 then raise exception 'Unit cost exceeds the supported range';end if;
  update public.ingredients set estimated_unit_cost_cents=next_value/(b.quantity+p_delta) where shop_id=p_shop and id=p_item;
 end if;
 insert into public.stock_movements(shop_id,ingredient_id,quantity_delta,value_delta_cents,kind,source_id,reason,created_by)
 values(p_shop,p_item,p_delta,case when p_revalue then cost when p_delta<0 then -cost else cost end,p_kind,p_source,p_reason,auth.uid());
 return cost;
end $$;

create function public.pos_inventory_save_item(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.ingredients; item_id uuid:=(p_data->>'id')::uuid; unit public.ingredient_unit:=(p_data->>'base_unit')::public.ingredient_unit; threshold numeric:=(p_data->>'minimum_stock')::numeric;
begin
 perform public.require_business_access(p_shop_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if item_id is null or length(trim(p_data->>'name')) not between 1 and 120 or p_data->>'name' is null or unit is null or threshold is null or threshold<0 or threshold>=1000000000000 or threshold<>round(threshold,6) or (unit='each' and threshold<>trunc(threshold)) or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'Check item name, unit, threshold and status';end if;
 select * into item from public.ingredients where shop_id=p_shop_id and id=item_id for update;
 if found and item.base_unit<>unit and (exists(select 1 from public.stock_movements where ingredient_id=item_id) or exists(select 1 from public.recipe_items where ingredient_id=item_id)) then raise exception 'Base unit cannot change after stock movements or recipe use';end if;
 insert into public.ingredients(id,shop_id,name,base_unit,minimum_stock,item_type,notes,active)
 values(item_id,p_shop_id,trim(p_data->>'name'),unit,threshold,p_data->>'item_type',coalesce(p_data->>'notes',''),(p_data->>'active')::boolean)
 on conflict(id) do update set name=excluded.name,base_unit=excluded.base_unit,minimum_stock=excluded.minimum_stock,item_type=excluded.item_type,notes=excluded.notes,active=excluded.active where ingredients.shop_id=p_shop_id returning * into item;
 if item.id is null then raise exception 'Inventory item belongs to another shop';end if;
 perform public.record_business_audit(p_shop_id,'inventory.item.saved','ingredient',item.id,p_data);
 return to_jsonb(item);
exception when unique_violation then raise exception 'An inventory item with this name already exists';
end $$;

create function public.pos_inventory_post(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; item public.ingredients; b public.inventory_balances; replay jsonb;
 kind text:=p_data->>'kind'; entered numeric:=(p_data->>'quantity')::numeric; qty numeric; delta numeric;
 unit text:=p_data->>'purchase_unit'; value bigint; cost numeric:=(p_data->>'total_cost_cents')::numeric; reason text:=trim(p_data->>'reason'); day date:=(p_data->>'occurred_on')::date;
begin
 perform public.require_business_access(p_shop_id);
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.post',p_data); if replay is not null then return replay;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 select * into item from public.ingredients where shop_id=p_shop_id and id=(p_data->>'ingredient_id')::uuid and active for update;
 if not found then raise exception 'Choose an active inventory item';end if;
 if kind is null or kind not in ('opening','receipt','count','waste','correction') or entered is null or entered<>round(entered,6) or abs(entered)>=1000000000 or day is null or reason is null or length(reason) not between 1 and 500 then raise exception 'Check stock quantity, date and reason';end if;
 if cost is not null and (cost<>trunc(cost) or cost not between 0 and 100000000000) then raise exception 'Enter a nonnegative purchase cost';end if;
 qty:=case when unit=item.base_unit::text then entered when unit='kg' and item.base_unit='g' then entered*1000 when unit='L' and item.base_unit='ml' then entered*1000 else null end;
 if qty is null or (item.base_unit='each' and qty<>trunc(qty)) then raise exception 'Purchase unit must match the item base unit';end if;
 insert into public.inventory_balances(shop_id,ingredient_id,value_cents) values(p_shop_id,item.id,0) on conflict do nothing;
 select * into strict b from public.inventory_balances where shop_id=p_shop_id and ingredient_id=item.id for update;
 if kind='count' then
  if qty<0 then raise exception 'Count cannot be negative';end if;
  if (p_data->>'expected_revision')::bigint is distinct from b.revision then raise exception 'Stock changed after this count was opened. Refresh and count again.';end if;
  delta:=qty-b.quantity;
 elsif kind='waste' then
  if qty<=0 then raise exception 'Enter the quantity lost';end if;delta:=-qty;
 else delta:=qty;
 end if;
 if kind in ('opening','receipt') and (qty<=0 or cost is null) then raise exception 'Enter a positive quantity and its actual total purchase cost (zero is allowed)';end if;
 if kind='opening' and exists(select 1 from public.stock_movements where shop_id=p_shop_id and ingredient_id=item.id) then raise exception 'Opening stock already recorded. Use Stock In or a physical count.';end if;
 if kind='correction' and delta=0 then raise exception 'Adjustment cannot be zero';end if;
 if delta>0 then
  value:=case when cost is not null then cost::bigint when b.quantity>0 and b.value_cents is not null then ceil(delta*b.value_cents/b.quantity)::bigint else null end;
  if value is null then raise exception 'Enter the actual cost of the additional stock';end if;
 end if;
 insert into public.pos_stock_documents(id,shop_id,ingredient_id,kind,occurred_on,purchase_unit,entered_quantity,purchase_cost_cents,supplier,reference,reason,notes,expected_revision,created_by)
 values(op,p_shop_id,item.id,kind,day,unit,entered,cost::bigint,coalesce(p_data->>'supplier',''),coalesce(p_data->>'reference',''),reason,coalesce(p_data->>'notes',''),(p_data->>'expected_revision')::bigint,auth.uid());
 if kind='count' and cost is not null then value:=cost::bigint;end if;
 perform public.pos_inventory_move(p_shop_id,item.id,delta,value,kind,op,reason,kind='count' and cost is not null);
 perform public.record_business_audit(p_shop_id,'inventory.'||kind,'ingredient',item.id,p_data);
 return public.finish_business_operation(p_shop_id,op,jsonb_build_object('id',op));
end $$;

create function public.pos_inventory_read(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_business_access(p_shop_id);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('minimum_stock',i.minimum_stock::text,'quantity',coalesce(b.quantity,0)::text,'value_cents',coalesce(case when b.quantity=0 then 0 else b.value_cents end,case when b.ingredient_id is null then 0 end),'revision',coalesce(b.revision,0),'unit_cost_cents',case when b.quantity>0 then b.value_cents/b.quantity else i.estimated_unit_cost_cents end::text) order by i.name) from public.ingredients i left join public.inventory_balances b on b.shop_id=i.shop_id and b.ingredient_id=i.id where i.shop_id=p_shop_id),'[]'),
 'movements',coalesce((select jsonb_agg(row_data order by row_data->>'created_at' desc) from (select to_jsonb(m)||jsonb_build_object('quantity_delta',m.quantity_delta::text,'previous_quantity',m.previous_quantity::text,'resulting_quantity',m.resulting_quantity::text,'name',i.name,'base_unit',i.base_unit,'occurred_on',coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date),'supplier',d.supplier,'reference',d.reference,'notes',d.notes,'purchase_unit',d.purchase_unit,'entered_quantity',d.entered_quantity) row_data from public.stock_movements m join public.ingredients i on i.id=m.ingredient_id join public.shops s on s.id=m.shop_id left join public.pos_stock_documents d on d.id=m.source_id where m.shop_id=p_shop_id and coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date) between p_from and p_to) history),'[]')) into result;
 return result;
end $$;
revoke all on function public.pos_inventory_move(uuid,uuid,numeric,bigint,text,uuid,text,boolean),public.pos_inventory_revision(),public.pos_inventory_capture_movement() from public,anon,authenticated;
revoke all on function public.pos_inventory_save_item(uuid,jsonb),public.pos_inventory_post(uuid,jsonb),public.pos_inventory_read(uuid,date,date) from public,anon;
grant execute on function public.pos_inventory_save_item(uuid,jsonb),public.pos_inventory_post(uuid,jsonb),public.pos_inventory_read(uuid,date,date) to authenticated;
commit;
