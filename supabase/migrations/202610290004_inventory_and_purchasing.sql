-- Operational commands use a shared transaction-scoped idempotency ledger.
create table public.business_operations (
  shop_id uuid not null references public.shops(id), id uuid not null,
  kind text not null, payload_hash text not null, actor_id uuid not null references auth.users(id),
  result jsonb, created_at timestamptz not null default now(), primary key(shop_id,id)
);
create function public.require_business_access(p_shop uuid, p_founder boolean default true) returns void
language plpgsql security definer set search_path = '' as $$ begin
  if auth.uid() is null or not public.is_shop_member(p_shop) or (p_founder and not public.is_shop_founder(p_shop)) then
    raise exception 'Access denied' using errcode='42501'; end if;
end $$;
create function public.claim_business_operation(p_shop uuid,p_id uuid,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.business_operations%rowtype; v_hash text;
begin
  if p_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>131072 then raise exception 'Invalid operation'; end if;
  v_hash := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  insert into public.business_operations(shop_id,id,kind,payload_hash,actor_id)
    values(p_shop,p_id,p_kind,v_hash,auth.uid()) on conflict do nothing;
  select * into strict v_row from public.business_operations where shop_id=p_shop and id=p_id for update;
  if v_row.kind<>p_kind or v_row.payload_hash<>v_hash then raise exception 'Operation identifier was already used for different data'; end if;
  return v_row.result;
end $$;
create function public.finish_business_operation(p_shop uuid,p_id uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$ begin
  update public.business_operations set result=p_result where shop_id=p_shop and id=p_id;
  return p_result;
end $$;
create function public.record_business_audit(p_shop uuid,p_action text,p_entity text,p_id uuid,p_context jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs(shop_id,actor_id,action,entity_type,entity_id,context)
    values(p_shop,auth.uid(),p_action,p_entity,p_id,p_context);
$$;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
  name text not null check(length(trim(name)) between 1 and 120), contact text not null default '' check(length(contact)<=500),
  active boolean not null default true, created_at timestamptz not null default now(), unique(shop_id,id)
);
create table public.purchases (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), supplier_id uuid not null,
  reference text not null default '' check(length(reference)<=120), status text not null default 'planned' check(status in('planned','ordered','partial','received','cancelled')),
  document_path text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(shop_id,id), foreign key(shop_id,supplier_id) references public.suppliers(shop_id,id)
);
create table public.purchase_items (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, purchase_id uuid not null, ingredient_id uuid not null,
  quantity numeric(18,6) not null check(quantity>0 and quantity<1000000000000),
  unit_cost_cents numeric(18,6) not null check(unit_cost_cents between 0 and 999999999999.999999),
  received_quantity numeric(18,6) not null default 0 check(received_quantity>=0 and received_quantity<=quantity),
  unique(shop_id,id), unique(purchase_id,ingredient_id),
  foreign key(shop_id,purchase_id) references public.purchases(shop_id,id),
  foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id)
);
create table public.purchase_receipts (
  id uuid primary key, shop_id uuid not null, purchase_id uuid not null, received_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id), foreign key(shop_id,purchase_id) references public.purchases(shop_id,id), unique(shop_id,id)
);
create table public.inventory_balances (
  shop_id uuid not null, ingredient_id uuid not null, quantity numeric(18,6) not null default 0,
  value_cents bigint check(value_cents between 0 and 9007199254740991), updated_at timestamptz not null default now(),
  primary key(shop_id,ingredient_id), foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, ingredient_id uuid not null,
  quantity_delta numeric(18,6) not null check(abs(quantity_delta)<1000000000000),
  value_delta_cents bigint, kind text not null check(kind in('opening','receipt','sale','waste','count','return','correction')),
  source_id uuid not null, reason text not null check(length(trim(reason)) between 1 and 500),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id), unique(source_id,ingredient_id,kind)
  ,check(quantity_delta<>0 or kind='count')
);
create index stock_movements_shop_time on public.stock_movements(shop_id,created_at desc);
create trigger immutable_stock before update or delete on public.stock_movements for each row execute function public.reject_history_change();
create trigger immutable_receipts before update or delete on public.purchase_receipts for each row execute function public.reject_history_change();

-- This internal function is the ONLY balance writer. Negative recovery stock is
-- reserved for a separately audited founder reconciliation of a real offline sale.
create function public.move_stock(p_shop uuid,p_ingredient uuid,p_delta numeric,p_value bigint,p_kind text,p_source uuid,p_reason text,p_recovery boolean default false,p_count_value boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_row public.inventory_balances%rowtype; v_cost bigint; v_new_value bigint; v_delta_value bigint;
begin
  if p_delta is null or p_delta<>round(p_delta,6) or not(abs(p_delta)<1000000000000) then raise exception 'Invalid stock quantity'; end if;
  if p_delta=0 and not p_count_value then return 0; end if;
  insert into public.inventory_balances(shop_id,ingredient_id,value_cents) values(p_shop,p_ingredient,0) on conflict do nothing;
  select * into strict v_row from public.inventory_balances where shop_id=p_shop and ingredient_id=p_ingredient for update;
  if p_delta<0 and v_row.quantity+p_delta<0 and not p_recovery then raise exception 'Insufficient recorded stock'; end if;
  if p_delta<0 then
    v_cost := case when v_row.quantity<=0 or v_row.value_cents is null or v_row.quantity+p_delta<0 then null
      when v_row.quantity+p_delta=0 then v_row.value_cents else least(v_row.value_cents,ceil(-p_delta*v_row.value_cents/v_row.quantity)::bigint) end;
    v_new_value := case when v_row.quantity+p_delta=0 then 0 else v_row.value_cents-v_cost end;
    v_delta_value := -v_cost;
  else
    if p_value is not null and p_value<0 then raise exception 'Invalid inventory value'; end if;
    v_new_value := case when v_row.quantity<0 then null when v_row.quantity=0 then p_value else v_row.value_cents+p_value end;
    v_delta_value := p_value; v_cost := p_value;
  end if;
  if p_count_value then
    if p_kind<>'count' or p_value is null or p_value<0 or (v_row.quantity+p_delta=0 and p_value<>0) then raise exception 'A zero count must have zero value'; end if;
    v_new_value:=p_value;v_delta_value:=p_value-v_row.value_cents;v_cost:=v_delta_value;
  end if;
  update public.inventory_balances set quantity=quantity+p_delta,value_cents=v_new_value,updated_at=now()
    where shop_id=p_shop and ingredient_id=p_ingredient;
  insert into public.stock_movements(shop_id,ingredient_id,quantity_delta,value_delta_cents,kind,source_id,reason,created_by)
    values(p_shop,p_ingredient,p_delta,v_delta_value,p_kind,p_source,p_reason,auth.uid());
  return v_cost;
end $$;

create function public.manage_inventory(p_shop_id uuid,p_action text,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_id uuid; v_row jsonb; v_qty numeric; v_delta numeric; v_value bigint;
  v_purchase public.purchases%rowtype; v_item public.purchase_items%rowtype; v_balance public.inventory_balances%rowtype;
begin
  perform public.require_business_access(p_shop_id);
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'inventory.'||p_action,p_data);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  case p_action
  when 'supplier' then
    if p_data->>'id' is null then
      insert into public.suppliers(shop_id,name,contact) values(p_shop_id,trim(p_data->>'name'),coalesce(p_data->>'contact','')) returning id into v_id;
    else
      update public.suppliers set name=trim(p_data->>'name'),contact=coalesce(p_data->>'contact',''),active=coalesce((p_data->>'active')::boolean,true)
        where shop_id=p_shop_id and id=(p_data->>'id')::uuid returning id into v_id;
      if not found then raise exception 'Supplier not found'; end if;
    end if;
  when 'purchase' then
    if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Purchase needs 1 to 100 lines'; end if;
    if not exists(select 1 from public.suppliers where shop_id=p_shop_id and id=(p_data->>'supplier_id')::uuid and active) then raise exception 'Active supplier required'; end if;
    insert into public.purchases(shop_id,supplier_id,reference,status,document_path,created_by)
      values(p_shop_id,(p_data->>'supplier_id')::uuid,coalesce(p_data->>'reference',''),coalesce(p_data->>'status','planned'),p_data->>'document_path',auth.uid()) returning id into v_id;
    if coalesce(p_data->>'status','planned') not in('planned','ordered') then raise exception 'New purchase must be planned or ordered'; end if;
    for v_row in select value from jsonb_array_elements(p_data->'items') loop
      if (v_row->>'quantity')::numeric<>round((v_row->>'quantity')::numeric,6) or (v_row->>'unit_cost_cents')::numeric<>round((v_row->>'unit_cost_cents')::numeric,6) then raise exception 'At most six decimal places'; end if;
      insert into public.purchase_items(shop_id,purchase_id,ingredient_id,quantity,unit_cost_cents)
        values(p_shop_id,v_id,(v_row->>'ingredient_id')::uuid,(v_row->>'quantity')::numeric,(v_row->>'unit_cost_cents')::numeric);
    end loop;
  when 'purchase_status' then
    v_id:=(p_data->>'id')::uuid;
    select * into strict v_purchase from public.purchases where id=v_id and shop_id=p_shop_id for update;
    if v_purchase.status not in('planned','ordered') or p_data->>'status' not in('ordered','cancelled') then raise exception 'Invalid purchase transition'; end if;
    update public.purchases set status=p_data->>'status' where id=v_id;
  when 'receive' then
    v_id:=p_operation_id;
    select * into strict v_purchase from public.purchases where id=(p_data->>'purchase_id')::uuid and shop_id=p_shop_id for update;
    if v_purchase.status not in('ordered','partial') then raise exception 'Order the purchase before receiving'; end if;
    if jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Receipt lines required'; end if;
    if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_data->'items')) then raise exception 'Duplicate receipt lines'; end if;
    insert into public.purchase_receipts(id,shop_id,purchase_id,created_by) values(v_id,p_shop_id,v_purchase.id,auth.uid());
    for v_row in select value from jsonb_array_elements(p_data->'items') order by value->>'id' loop
      select * into strict v_item from public.purchase_items where id=(v_row->>'id')::uuid and purchase_id=v_purchase.id and shop_id=p_shop_id for update;
      v_qty:=(v_row->>'quantity')::numeric;
      if v_qty is null or not(v_qty>0 and v_qty<=v_item.quantity-v_item.received_quantity) or v_qty<>round(v_qty,6) then raise exception 'Receipt exceeds remaining quantity'; end if;
      perform public.move_stock(p_shop_id,v_item.ingredient_id,v_qty,
        (ceil((v_item.received_quantity+v_qty)*v_item.unit_cost_cents)-ceil(v_item.received_quantity*v_item.unit_cost_cents))::bigint,'receipt',v_id,'Purchase received');
      update public.purchase_items set received_quantity=received_quantity+v_qty where id=v_item.id;
    end loop;
    update public.purchases set status=case when exists(select 1 from public.purchase_items where purchase_id=v_purchase.id and received_quantity<quantity) then 'partial' else 'received' end where id=v_purchase.id;
  when 'opening','count','waste','correction' then
    v_id:=p_operation_id;
    -- One shop advisory lock serializes stock adjustments and receiving/checkout
    -- lock order. It also covers two concurrent first opening-stock entries.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
    if not exists(select 1 from public.ingredients where shop_id=p_shop_id and id=(p_data->>'ingredient_id')::uuid) then raise exception 'Ingredient not found'; end if;
    select * into v_balance from public.inventory_balances where shop_id=p_shop_id and ingredient_id=(p_data->>'ingredient_id')::uuid for update;
    v_qty:=(p_data->>'quantity')::numeric;
    if v_qty is null or not(v_qty>=0 and v_qty<1000000000000) or v_qty<>round(v_qty,6) then raise exception 'Invalid quantity'; end if;
    if p_action='opening' and exists(select 1 from public.stock_movements where shop_id=p_shop_id and ingredient_id=(p_data->>'ingredient_id')::uuid) then raise exception 'Opening stock already recorded; use a count'; end if;
    v_delta:=case when p_action='count' then v_qty-coalesce(v_balance.quantity,0) when p_action='waste' then -v_qty else v_qty end;
    v_value:=case when p_action='opening' or (p_action='count' and p_data->>'value_cents' is not null) then (p_data->>'value_cents')::bigint
      when v_delta>0 and v_balance.quantity>0 then ceil(v_delta*v_balance.value_cents/v_balance.quantity)::bigint else null end;
    perform public.move_stock(p_shop_id,(p_data->>'ingredient_id')::uuid,v_delta,v_value,p_action,v_id,p_data->>'reason',false,p_action='count' and p_data->>'value_cents' is not null);
  else raise exception 'Unknown inventory action';
  end case;
  perform public.record_business_audit(p_shop_id,'inventory.'||p_action,p_action,v_id,p_data);
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_id));
end $$;

do $$ declare v_table text; begin
  foreach v_table in array array['business_operations','suppliers','purchases','purchase_items','purchase_receipts','inventory_balances','stock_movements'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on public.%I from public,anon,authenticated',v_table);
    execute format('grant select on public.%I to authenticated',v_table);
    execute format('create policy "Founders read" on public.%I for select to authenticated using(public.is_shop_founder(shop_id))',v_table);
  end loop;
end $$;
revoke all on function public.require_business_access(uuid,boolean),public.claim_business_operation(uuid,uuid,text,jsonb),public.finish_business_operation(uuid,uuid,jsonb),
  public.record_business_audit(uuid,text,text,uuid,jsonb),public.move_stock(uuid,uuid,numeric,bigint,text,uuid,text,boolean,boolean) from public,anon,authenticated;
revoke all on function public.manage_inventory(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.manage_inventory(uuid,text,jsonb,uuid) to authenticated;
