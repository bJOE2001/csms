create table public.pos_sessions (
  id uuid primary key default gen_random_uuid(),shop_id uuid not null,device_id uuid not null references public.pos_devices(id),shift_id uuid not null,
  user_id uuid not null references auth.users(id),issued_at timestamptz not null default now(),expires_at timestamptz not null,
  offline_capable boolean not null,menu jsonb not null,closed_sequence integer check(closed_sequence>=0),
  foreign key(shop_id,shift_id) references public.cashier_shifts(shop_id,id),unique(shop_id,id)
);
create table public.orders (
  id uuid primary key,shop_id uuid not null,session_id uuid not null,shift_id uuid not null,
  sequence integer not null check(sequence between 1 and 1000000),order_type text not null check(order_type in('dine_in','takeout')),
  table_label text not null default '' check(length(table_label)<=40),status text not null default 'completed' check(status in('completed','refunded','cancelled')),
  gross_cents bigint not null check(gross_cents between 0 and 9007199254740991),discount_cents bigint not null check(discount_cents>=0 and discount_cents<=gross_cents),
  total_cents bigint not null check(total_cents=gross_cents-discount_cents),cogs_cents bigint check(cogs_cents between 0 and 9007199254740991),
  inventory_exception boolean not null default false,client_created_at timestamptz not null,created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),receipt_snapshot jsonb not null,
  unique(shop_id,id),unique(session_id,sequence),foreign key(shop_id,session_id) references public.pos_sessions(shop_id,id),foreign key(shop_id,shift_id) references public.cashier_shifts(shop_id,id)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),shop_id uuid not null,order_id uuid not null,variant_id uuid not null,price_id uuid not null,recipe_id uuid not null,
  product_name text not null,variant_name text not null,quantity integer not null check(quantity between 1 and 100),unit_price_cents bigint not null,
  line_total_cents bigint not null check(line_total_cents=quantity*unit_price_cents),
  foreign key(shop_id,order_id) references public.orders(shop_id,id),foreign key(shop_id,variant_id) references public.product_variants(shop_id,id),
  foreign key(shop_id,price_id) references public.product_prices(shop_id,id),foreign key(shop_id,recipe_id) references public.recipes(shop_id,id)
);
create table public.order_consumptions (
  shop_id uuid not null,order_id uuid not null,ingredient_id uuid not null,quantity numeric(18,6) not null check(quantity>0),
  cost_cents bigint check(cost_cents between 0 and 9007199254740991),primary key(order_id,ingredient_id),
  foreign key(shop_id,order_id) references public.orders(shop_id,id),foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),shop_id uuid not null,order_id uuid not null,method text not null,
  amount_cents bigint not null check(amount_cents between 0 and 9007199254740991),tendered_cents bigint,
  reference text not null default '' check(length(reference)<=120),status text not null check(status in('pending','confirmed','refunded','cancelled')),
  confirmed_by uuid references auth.users(id),confirmed_at timestamptz,created_at timestamptz not null default now(),
  foreign key(shop_id,order_id) references public.orders(shop_id,id),unique(shop_id,id)
);
create table public.order_events (
  id uuid primary key,shop_id uuid not null,order_id uuid not null,kind text not null check(kind in('refund','cancel','stock_return','payment_confirmed','recovery')),
  amount_cents bigint not null default 0 check(amount_cents>=0),cash_refund_cents bigint not null default 0 check(cash_refund_cents>=0),
  confirmed_refund_cents bigint not null default 0 check(confirmed_refund_cents>=0 and confirmed_refund_cents<=amount_cents),
  shift_id uuid,reason text not null check(length(trim(reason)) between 1 and 500),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
  foreign key(shop_id,order_id) references public.orders(shop_id,id),foreign key(shop_id,shift_id) references public.cashier_shifts(shop_id,id)
);
create unique index one_reversal_per_order on public.order_events(order_id) where kind in('refund','cancel');
create unique index one_stock_return_per_order on public.order_events(order_id) where kind='stock_return';
create index orders_shop_time on public.orders(shop_id,created_at desc);
create trigger immutable_order_items before update or delete on public.order_items for each row execute function public.reject_history_change();
create trigger immutable_consumptions before update or delete on public.order_consumptions for each row execute function public.reject_history_change();
create trigger immutable_order_events before update or delete on public.order_events for each row execute function public.reject_history_change();
create trigger no_delete_orders before delete on public.orders for each row execute function public.reject_history_change();
create trigger no_delete_payments before delete on public.payments for each row execute function public.reject_history_change();

create function public.open_pos_session(p_shop_id uuid,p_device_id uuid,p_shift_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_shift public.cashier_shifts%rowtype;v_device public.pos_devices%rowtype;v_menu jsonb;v_id uuid;v_expires timestamptz;v_settings jsonb;
begin
  perform public.require_business_access(p_shop_id,false);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id,false);
  select * into strict v_shift from public.cashier_shifts where shop_id=p_shop_id and id=p_shift_id and cashier_id=auth.uid() and closed_at is null for update;
  select * into strict v_device from public.pos_devices where shop_id=p_shop_id and id=p_device_id and id=v_shift.device_id and enabled;
  -- Refreshing the browser retrieves the same session and sequence namespace.
  select id,expires_at,menu into v_id,v_expires,v_menu from public.pos_sessions where shift_id=p_shift_id and user_id=auth.uid() and closed_sequence is null order by issued_at desc limit 1;
  if v_id is null then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_menu from (
      select v.id variant_id,p.name product_name,v.name variant_name,c.name category,pr.id price_id,pr.price_cents,r.id recipe_id
      from public.product_variants v join public.products p on p.id=v.product_id join public.categories c on c.id=p.category_id
      join lateral(select id,price_cents from public.product_prices where variant_id=v.id order by version desc limit 1) pr on true
      join lateral(select id from public.recipes where variant_id=v.id order by version desc limit 1) r on true
      where v.shop_id=p_shop_id and v.available order by p.name,v.name limit 1000) x;
    if jsonb_array_length(v_menu)>=1000 then raise exception 'POS menu exceeds supported capacity'; end if;
    v_expires:=now()+make_interval(hours=>coalesce((select offline_hours from public.business_settings where shop_id=p_shop_id),12));
    insert into public.pos_sessions(shop_id,device_id,shift_id,user_id,expires_at,offline_capable,menu) values(p_shop_id,p_device_id,p_shift_id,auth.uid(),v_expires,v_device.offline_capable,v_menu) returning id into v_id;
  end if;
  select jsonb_build_object('name',s.name,'timezone',s.timezone,'address',coalesce(b.address,''),'receipt_footer',coalesce(b.receipt_footer,''),
    'methods',coalesce(b.payment_methods,array['cash','gcash']),'max_discount_bps',coalesce(b.max_discount_bps,2000)) into v_settings
    from public.shops s left join public.business_settings b on b.shop_id=s.id where s.id=p_shop_id;
  return jsonb_build_object('id',v_id,'shop_id',p_shop_id,'user_id',auth.uid(),'device_id',p_device_id,'shift_id',p_shift_id,'expires_at',v_expires,
    'offline_capable',v_device.offline_capable,'menu',v_menu,'settings',v_settings,'founder',public.is_shop_founder(p_shop_id),
    'server_sequence',coalesce((select max(sequence) from public.orders where session_id=v_id),0));
end $$;

create function public.process_order(p_shop_id uuid,p_payload jsonb,p_operation_id uuid,p_recovery_reason text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_session public.pos_sessions%rowtype;v_shift public.cashier_shifts%rowtype;
  v_line jsonb;v_allowed jsonb;v_price public.product_prices%rowtype;v_recipe public.recipes%rowtype;
  v_gross bigint:=0;v_discount bigint;v_due bigint;v_qty integer;v_cost bigint;v_total_cost bigint:=0;v_known boolean:=true;
  v_stock record;v_method text;v_tender bigint;v_recovery boolean:=p_recovery_reason is not null;v_receipt jsonb;v_sequence integer;
begin
  perform public.require_business_access(p_shop_id,false);
  -- Return a prior committed receipt before checking lease/device/shift expiry.
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'order',p_payload);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id,false);
  if v_recovery and (not public.is_shop_founder(p_shop_id) or length(trim(p_recovery_reason)) not between 1 and 500) then raise exception 'Founder reconciliation reason required' using errcode='42501'; end if;
  select * into strict v_session from public.pos_sessions where shop_id=p_shop_id and id=(p_payload->>'session_id')::uuid for update;
  select * into strict v_shift from public.cashier_shifts where shop_id=p_shop_id and id=v_session.shift_id for update;
  if not v_recovery and (v_session.user_id<>auth.uid() or v_session.expires_at<now() or v_session.closed_sequence is not null or v_shift.closed_at is not null
    or not exists(select 1 from public.pos_devices where id=v_session.device_id and shop_id=p_shop_id and enabled)) then raise exception 'POS authorization expired or shift closed; founder reconciliation required'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Order needs 1 to 100 lines'; end if;
  if (select count(*)<>count(distinct value->>'variant_id') from jsonb_array_elements(p_payload->'items')) then raise exception 'Combine duplicate variants in the cart'; end if;
  for v_line in select value from jsonb_array_elements(p_payload->'items') loop
    v_qty:=(v_line->>'quantity')::integer;
    if v_qty is null or v_qty not between 1 and 100 or (v_line->>'quantity') !~ '^[0-9]{1,3}$' then raise exception 'Invalid order quantity'; end if;
    select value into v_allowed from jsonb_array_elements(v_session.menu) where value->>'variant_id'=v_line->>'variant_id';
    if not found then raise exception 'Variant is not in the authorized menu snapshot'; end if;
    select * into strict v_price from public.product_prices where id=(v_allowed->>'price_id')::uuid and shop_id=p_shop_id and variant_id=(v_line->>'variant_id')::uuid;
    select * into strict v_recipe from public.recipes where id=(v_allowed->>'recipe_id')::uuid and shop_id=p_shop_id and variant_id=v_price.variant_id;
    v_gross:=v_gross+v_qty*v_price.price_cents;
  end loop;
  v_discount:=coalesce((p_payload->>'discount_cents')::bigint,0);
  if v_discount<0 or v_discount>v_gross or (not v_recovery and v_discount>0 and (not public.is_shop_founder(p_shop_id) or v_discount*10000::numeric>v_gross*coalesce((select max_discount_bps from public.business_settings where shop_id=p_shop_id),2000)::numeric)) then raise exception 'Discount exceeds founder policy'; end if;
  v_due:=v_gross-v_discount;v_method:=p_payload->>'method';v_tender:=(p_payload->>'tendered_cents')::bigint;
  if v_method is null or length(v_method) not between 1 and 80 or (not v_recovery and not(v_method=any(coalesce((select payment_methods from public.business_settings where shop_id=p_shop_id),array['cash','gcash'])))) then raise exception 'Payment method is not configured'; end if;
  if v_method='cash' and (v_tender is null or v_tender<v_due or v_tender>9007199254740991) then raise exception 'Cash tender must cover the amount due'; end if;
  select jsonb_build_object('name',s.name,'timezone',s.timezone,'address',coalesce(b.address,''),'footer',coalesce(b.receipt_footer,'')) into v_receipt from public.shops s left join public.business_settings b on b.shop_id=s.id where s.id=p_shop_id;
  v_sequence:=(p_payload->>'sequence')::integer;
  if v_recovery and exists(select 1 from public.orders where session_id=v_session.id and sequence=v_sequence) then
    select coalesce(max(sequence),0)+1 into v_sequence from public.orders where session_id=v_session.id;
  end if;
  insert into public.orders(id,shop_id,session_id,shift_id,sequence,order_type,table_label,gross_cents,discount_cents,total_cents,inventory_exception,client_created_at,created_by,receipt_snapshot)
    values(p_operation_id,p_shop_id,v_session.id,v_shift.id,v_sequence,p_payload->>'order_type',coalesce(p_payload->>'table_label',''),v_gross,v_discount,v_due,v_recovery,(p_payload->>'created_at')::timestamptz,v_session.user_id,v_receipt);
  for v_line in select value from jsonb_array_elements(p_payload->'items') loop
    select value into strict v_allowed from jsonb_array_elements(v_session.menu) where value->>'variant_id'=v_line->>'variant_id';
    insert into public.order_items(shop_id,order_id,variant_id,price_id,recipe_id,product_name,variant_name,quantity,unit_price_cents,line_total_cents)
      values(p_shop_id,p_operation_id,(v_allowed->>'variant_id')::uuid,(v_allowed->>'price_id')::uuid,(v_allowed->>'recipe_id')::uuid,v_allowed->>'product_name',v_allowed->>'variant_name',(v_line->>'quantity')::int,(v_allowed->>'price_cents')::bigint,(v_line->>'quantity')::int*(v_allowed->>'price_cents')::bigint);
  end loop;
  -- Aggregate before rounding and deduct each ingredient once. Cost snapshots
  -- conserve the balance value, including every residual centavo on depletion.
  for v_stock in select ri.ingredient_id,ceil(sum(ri.quantity*oi.quantity*(10000+ri.waste_bps)/10000)*1000000)/1000000 qty
    from public.order_items oi join public.recipe_items ri on ri.recipe_id=oi.recipe_id where oi.order_id=p_operation_id group by ri.ingredient_id order by ri.ingredient_id loop
    v_cost:=public.move_stock(p_shop_id,v_stock.ingredient_id,-v_stock.qty,null,'sale',p_operation_id,case when v_recovery then p_recovery_reason else 'Order consumption' end,v_recovery);
    insert into public.order_consumptions(shop_id,order_id,ingredient_id,quantity,cost_cents) values(p_shop_id,p_operation_id,v_stock.ingredient_id,v_stock.qty,v_cost);
    if v_cost is null then v_known:=false; else v_total_cost:=v_total_cost+v_cost; end if;
  end loop;
  update public.orders set cogs_cents=case when v_known then v_total_cost else null end where id=p_operation_id;
  insert into public.payments(shop_id,order_id,method,amount_cents,tendered_cents,reference,status,confirmed_by,confirmed_at)
    values(p_shop_id,p_operation_id,v_method,v_due,v_tender,coalesce(p_payload->>'reference',''),case when v_method='cash' then 'confirmed' else 'pending' end,case when v_method='cash' then auth.uid() end,case when v_method='cash' then now() end);
  if v_recovery then
    insert into public.order_events(id,shop_id,order_id,kind,reason,created_by) values(gen_random_uuid(),p_shop_id,p_operation_id,'recovery',p_recovery_reason,auth.uid());
    -- Late recovery never silently rewrites a previously finalized cash count.
    if v_shift.closed_at is not null then update public.cashier_shifts set unresolved=true where id=v_shift.id; end if;
  end if;
  perform public.record_business_audit(p_shop_id,case when v_recovery then 'order.reconciled' else 'order.completed' end,'order',p_operation_id,jsonb_build_object('session_id',v_session.id,'reason',p_recovery_reason,'requested_sequence',p_payload->>'sequence','server_sequence',v_sequence));
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',p_operation_id,'total_cents',v_due,'change_cents',case when v_method='cash' then v_tender-v_due else 0 end,'payment_status',case when v_method='cash' then 'confirmed' else 'pending' end));
end $$;

create function public.manage_order(p_shop_id uuid,p_action text,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_order public.orders%rowtype;v_payment public.payments%rowtype;v_cash bigint;v_confirmed bigint;v_shift uuid;v_stock record;
begin
  perform public.require_business_access(p_shop_id);
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'order.'||p_action,p_data);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  if length(trim(coalesce(p_data->>'reason',''))) not between 1 and 500 then raise exception 'Reason required'; end if;
  select * into strict v_order from public.orders where shop_id=p_shop_id and id=(p_data->>'order_id')::uuid for update;
  case p_action
  when 'confirm_payment' then
    if v_order.status<>'completed' then raise exception 'Completed order required'; end if;
    select * into strict v_payment from public.payments where shop_id=p_shop_id and order_id=v_order.id and status='pending' for update;
    update public.payments set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=v_payment.id;
    insert into public.order_events(id,shop_id,order_id,kind,amount_cents,reason,created_by) values(p_operation_id,p_shop_id,v_order.id,'payment_confirmed',v_payment.amount_cents,p_data->>'reason',auth.uid());
  when 'refund','cancel' then
    if v_order.status<>'completed' then raise exception 'Order already reversed'; end if;
    select coalesce(sum(amount_cents),0),coalesce(sum(amount_cents) filter(where method='cash'),0) into v_confirmed,v_cash from public.payments where order_id=v_order.id and status='confirmed';
    v_shift:=(p_data->>'shift_id')::uuid;
    if v_cash>0 and not exists(select 1 from public.cashier_shifts where shop_id=p_shop_id and id=v_shift and closed_at is null and cashier_id=auth.uid()) then raise exception 'Open assigned shift required for cash refunds'; end if;
    update public.payments set status=case when status='confirmed' then 'refunded' else 'cancelled' end where order_id=v_order.id and status in('confirmed','pending');
    update public.orders set status=case when p_action='refund' then 'refunded' else 'cancelled' end where id=v_order.id;
    insert into public.order_events(id,shop_id,order_id,kind,amount_cents,cash_refund_cents,confirmed_refund_cents,shift_id,reason,created_by)
      values(p_operation_id,p_shop_id,v_order.id,p_action,v_order.total_cents,v_cash,v_confirmed,case when v_cash>0 then v_shift end,p_data->>'reason',auth.uid());
  when 'return_stock' then
    if v_order.status='completed' then raise exception 'Reverse the order before an explicit stock return'; end if;
    if exists(select 1 from public.order_events where order_id=v_order.id and kind='stock_return') then raise exception 'Stock already returned'; end if;
    for v_stock in select * from public.order_consumptions where order_id=v_order.id order by ingredient_id loop
      perform public.move_stock(p_shop_id,v_stock.ingredient_id,v_stock.quantity,v_stock.cost_cents,'return',p_operation_id,p_data->>'reason');
    end loop;
    insert into public.order_events(id,shop_id,order_id,kind,reason,created_by) values(p_operation_id,p_shop_id,v_order.id,'stock_return',p_data->>'reason',auth.uid());
  else raise exception 'Unknown order action'; end case;
  perform public.record_business_audit(p_shop_id,'order.'||p_action,'order',v_order.id,p_data);
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_order.id));
end $$;

create function public.close_cashier_shift(p_shop_id uuid,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_shift public.cashier_shifts%rowtype;v_session public.pos_sessions%rowtype;v_seq int;v_expected bigint;v_force boolean:=coalesce((p_data->>'force')::boolean,false);
begin
  perform public.require_business_access(p_shop_id,false);
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'shift.close',p_data);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id,false);
  select * into strict v_shift from public.cashier_shifts where shop_id=p_shop_id and id=(p_data->>'shift_id')::uuid for update;
  if v_shift.closed_at is not null or (v_shift.cashier_id<>auth.uid() and not public.is_shop_founder(p_shop_id)) then raise exception 'Assigned open shift required'; end if;
  if v_force and (not public.is_shop_founder(p_shop_id) or length(trim(coalesce(p_data->>'reason','')))=0) then raise exception 'Founder must explain unresolved closure'; end if;
  select * into v_session from public.pos_sessions where shift_id=v_shift.id and closed_sequence is null for update;
  if found then
    v_seq:=(p_data->>'last_sequence')::int;
    if not v_force and (v_seq is null or v_seq<0 or (select count(*) from public.orders where session_id=v_session.id)<>v_seq
      or coalesce((select max(sequence) from public.orders where session_id=v_session.id),0)<>v_seq) then raise exception 'Synchronize every queued sequence before closing'; end if;
    update public.pos_sessions set closed_sequence=coalesce(v_seq,0) where id=v_session.id;
  end if;
  if not v_force and (exists(select 1 from public.payments p join public.orders o on o.id=p.order_id where o.shift_id=v_shift.id and p.status='pending')
    or exists(select 1 from public.cash_movements where shift_id=v_shift.id and status='pending')) then raise exception 'Resolve pending payments and cash requests before closing'; end if;
  select v_shift.opening_cents
    +coalesce((select sum(p.amount_cents) from public.payments p join public.orders o on o.id=p.order_id where o.shift_id=v_shift.id and p.method='cash' and p.status in('confirmed','refunded')),0)
    -coalesce((select sum(cash_refund_cents) from public.order_events where shift_id=v_shift.id),0)
    +coalesce((select sum(amount_cents) from public.cash_movements where shift_id=v_shift.id and status='approved'),0) into v_expected;
  update public.cashier_shifts set closed_at=now(),counted_cents=(p_data->>'counted_cents')::bigint,expected_cents=v_expected,close_note=coalesce(p_data->>'reason',''),unresolved=v_force where id=v_shift.id;
  if (p_data->>'counted_cents') is null then raise exception 'Counted cash required'; end if;
  perform public.record_business_audit(p_shop_id,'shift.closed','shift',v_shift.id,p_data||jsonb_build_object('expected_cents',v_expected,'unresolved',v_force));
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_shift.id,'expected_cents',v_expected));
end $$;

do $$ declare v_table text; begin
  foreach v_table in array array['pos_sessions','orders','order_items','order_consumptions','payments','order_events'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on public.%I from public,anon,authenticated',v_table);
    -- Costs and session snapshots are never directly exposed to staff.
    execute format('grant select on public.%I to authenticated',v_table);
    execute format('create policy "Founders read" on public.%I for select to authenticated using(public.is_shop_founder(shop_id))',v_table);
  end loop;
end $$;
revoke all on function public.open_pos_session(uuid,uuid,uuid),public.process_order(uuid,jsonb,uuid,text),public.close_cashier_shift(uuid,jsonb,uuid),public.manage_order(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.open_pos_session(uuid,uuid,uuid),public.process_order(uuid,jsonb,uuid,text),public.close_cashier_shift(uuid,jsonb,uuid),public.manage_order(uuid,text,jsonb,uuid) to authenticated;
