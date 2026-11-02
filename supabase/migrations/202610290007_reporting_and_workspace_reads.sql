-- Safe read RPCs allow staff order/shift access without exposing ingredient costs,
-- expenses, founder funding, session payloads, or profit information.
create function public.business_report(p_shop_id uuid,p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_from timestamptz;v_to timestamptz;v_tz text;v_sales jsonb;v_finance jsonb;v_stock jsonb;v_products jsonb;v_methods jsonb;v_sales_methods jsonb;v_movements jsonb;
begin
  perform public.require_business_access(p_shop_id);
  if p_start is null or p_end is null or p_end<p_start or p_end-p_start>366 then raise exception 'Choose a report range of at most 367 days'; end if;
  select timezone into strict v_tz from public.shops where id=p_shop_id;
  v_from:=p_start::timestamp at time zone v_tz;v_to:=(p_end+1)::timestamp at time zone v_tz;
  select jsonb_build_object('orders',count(*),'completed_orders',count(*) filter(where status='completed'),'gross_cents',coalesce(sum(gross_cents),0),'discount_cents',coalesce(sum(discount_cents),0),
    'known_cogs_cents',coalesce(sum(cogs_cents),0),'missing_cost_orders',count(*) filter(where cogs_cents is null),'inventory_exceptions',count(*) filter(where inventory_exception),
    'refund_cents',coalesce((select sum(amount_cents) from public.order_events where shop_id=p_shop_id and kind in('refund','cancel') and created_at>=v_from and created_at<v_to),0),
    'returned_cost_cents',coalesce((select sum(value_delta_cents) from public.stock_movements where shop_id=p_shop_id and kind='return' and created_at>=v_from and created_at<v_to),0),
    'missing_return_costs',(select count(*) from public.stock_movements where shop_id=p_shop_id and kind='return' and value_delta_cents is null and created_at>=v_from and created_at<v_to),
    'pending_payment_cents',coalesce((select sum(p.amount_cents) from public.payments p join public.orders o on o.id=p.order_id where o.shop_id=p_shop_id and p.status='pending' and o.created_at>=v_from and o.created_at<v_to),0)) into v_sales
    from public.orders where shop_id=p_shop_id and created_at>=v_from and created_at<v_to;
  select jsonb_build_object('planned_budget_cents',coalesce((select sum(planned_cents) from public.startup_budgets where shop_id=p_shop_id),0),
    'actual_spending_cents',coalesce(sum(amount_cents) filter(where status='approved'),0),
    'operating_expenses_cents',coalesce(sum(amount_cents) filter(where status='approved' and classification='operating'),0),
    'pending_expense_cents',coalesce(sum(amount_cents) filter(where status='pending'),0),
    'wastage_cost_cents',coalesce((select -sum(value_delta_cents) from public.stock_movements where shop_id=p_shop_id and kind='waste' and created_at>=v_from and created_at<v_to),0),
    'missing_wastage_costs',(select count(*) from public.stock_movements where shop_id=p_shop_id and kind='waste' and value_delta_cents is null and created_at>=v_from and created_at<v_to),
    'confirmed_funding_cents',coalesce((select sum(amount_cents) from public.founder_contributions where shop_id=p_shop_id and status='confirmed' and occurred_on between p_start and p_end),0),
    'pending_funding_cents',coalesce((select sum(amount_cents) from public.founder_contributions where shop_id=p_shop_id and status='pending'),0),
    'unresolved_shifts',(select count(*) from public.cashier_shifts where shop_id=p_shop_id and unresolved)) into v_finance
    from public.expenses where shop_id=p_shop_id and occurred_on between p_start and p_end;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_stock from(
    select i.id,i.name,i.base_unit,coalesce(b.quantity,0)::text quantity,i.minimum_stock::text,b.value_cents,
      coalesce(b.quantity,0)<=i.minimum_stock low_stock,b.value_cents is null valuation_unavailable
      from public.ingredients i left join public.inventory_balances b on b.shop_id=i.shop_id and b.ingredient_id=i.id where i.shop_id=p_shop_id order by i.name) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_products from(
    select oi.product_name,oi.variant_name,sum(oi.quantity) quantity,sum(oi.line_total_cents) gross_cents,
      -- Clearly labelled allocation, not a claim of exact ingredient cost per line.
      case when bool_and(o.cogs_cents is not null) then sum(o.cogs_cents*oi.line_total_cents::numeric/nullif(o.gross_cents,0))::bigint end allocated_cogs_cents
    from public.order_items oi join public.orders o on o.id=oi.order_id where o.shop_id=p_shop_id and o.created_at>=v_from and o.created_at<v_to
    group by oi.product_name,oi.variant_name order by sum(oi.line_total_cents) desc limit 100) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_methods from(
    select method,status,sum(amount_cents) amount_cents from(
      select p.method,'funds_confirmed'::text status,p.amount_cents from public.payments p
        where p.shop_id=p_shop_id and p.confirmed_at>=v_from and p.confirmed_at<v_to
      union all
      select p.method,'funds_refunded'::text,e.confirmed_refund_cents from public.order_events e join public.payments p on p.order_id=e.order_id
        where e.shop_id=p_shop_id and e.kind in('refund','cancel') and e.created_at>=v_from and e.created_at<v_to and e.confirmed_refund_cents>0
    ) flows group by method,status order by method,status) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_sales_methods from(
    select p.method,sum(p.amount_cents) sales_cents from public.payments p join public.orders o on o.id=p.order_id
      where o.shop_id=p_shop_id and o.created_at>=v_from and o.created_at<v_to group by p.method order by p.method) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_movements from(
    select i.name,i.base_unit,m.kind,sum(m.quantity_delta)::text quantity_delta,sum(m.value_delta_cents) value_delta_cents,
      count(*) filter(where m.value_delta_cents is null) missing_values
      from public.stock_movements m join public.ingredients i on i.id=m.ingredient_id where m.shop_id=p_shop_id and m.created_at>=v_from and m.created_at<v_to
      group by i.name,i.base_unit,m.kind order by i.name,m.kind limit 1000) x;
  return jsonb_build_object('sales',v_sales,'finance',v_finance,'inventory',v_stock,'products',v_products,'payments',v_methods,'sales_methods',v_sales_methods,'movements',v_movements,
    'range',jsonb_build_object('start',p_start,'end',p_end,'timezone',v_tz),'costing_policy','moving_weighted_average');
end $$;

create function public.get_business_data(p_shop_id uuid,p_module text,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_data jsonb:='{}';v_founder boolean;v_rows jsonb;v_table text;v_tables text[];v_offset int;
begin
  perform public.require_business_access(p_shop_id,false);v_founder:=public.is_shop_founder(p_shop_id);
  if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid page'; end if;v_offset:=p_page*50;
  if not v_founder and p_module not in('orders','shifts','pos') then raise exception 'Founder access required' using errcode='42501'; end if;
  if p_module='orders' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(
      select id,order_type,table_label,status,gross_cents,discount_cents,total_cents,client_created_at,created_at,created_by,receipt_snapshot
      from public.orders where shop_id=p_shop_id order by created_at desc,id desc limit 50 offset v_offset) x;
    v_data:=jsonb_build_object('orders',v_rows);
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(
      select oi.* from public.order_items oi join public.orders o on o.id=oi.order_id where o.id in
        (select id from public.orders where shop_id=p_shop_id order by created_at desc,id desc limit 50 offset v_offset)) x;
    v_data:=v_data||jsonb_build_object('order_items',v_rows);
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select p.* from public.payments p where p.order_id in
      (select id from public.orders where shop_id=p_shop_id order by created_at desc,id desc limit 50 offset v_offset)) x;
    v_data:=v_data||jsonb_build_object('payments',v_rows);
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select e.* from public.order_events e where e.order_id in
      (select id from public.orders where shop_id=p_shop_id order by created_at desc,id desc limit 50 offset v_offset)) x;
    v_data:=v_data||jsonb_build_object('order_events',v_rows);
  elsif p_module in('shifts','pos') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select * from public.cashier_shifts where shop_id=p_shop_id and (v_founder or cashier_id=auth.uid()) order by opened_at desc limit 50 offset v_offset) x;
    v_data:=jsonb_build_object('cashier_shifts',v_rows);
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select c.* from public.cash_movements c join public.cashier_shifts s on s.id=c.shift_id where c.shop_id=p_shop_id and (v_founder or s.cashier_id=auth.uid()) order by c.created_at desc limit 100) x;
    v_data:=v_data||jsonb_build_object('cash_movements',v_rows);
  else
    v_tables:=case p_module
      when 'inventory' then array['inventory_balances','stock_movements']
      when 'purchases' then array['suppliers','purchases','purchase_items','purchase_receipts']
      when 'expenses' then array['expenses'] when 'funding' then array['founder_contributions']
      when 'budgets' then array['startup_budgets'] when 'settings' then array['business_settings']
      when 'staff' then array['shop_members','membership_invites'] when 'audit' then array['audit_logs']
      when 'dashboard' then array[]::text[] else null end;
    if v_tables is null then raise exception 'Unknown workspace module'; end if;
    foreach v_table in array v_tables loop
      if v_table='inventory_balances' then
        select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select shop_id,ingredient_id,quantity::text,value_cents,updated_at from public.inventory_balances where shop_id=p_shop_id limit 1000) x;
      elsif v_table='business_settings' then
        select coalesce(jsonb_agg(to_jsonb(b)),'[]') into v_rows from public.business_settings b where shop_id=p_shop_id;
      elsif v_table='stock_movements' then
        select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select id,ingredient_id,quantity_delta::text,value_delta_cents,kind,reason,created_at from public.stock_movements where shop_id=p_shop_id order by created_at desc,id desc limit 50 offset v_offset) x;
      elsif v_table='shop_members' then
        select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select m.*,p.display_name from public.shop_members m left join public.profiles p on p.user_id=m.user_id where m.shop_id=p_shop_id order by m.created_at limit 1000) x;
      else
        -- Identifiers come exclusively from the fixed allowlist above.
        execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from (select * from public.%I where shop_id=$1 order by %I desc limit %s offset $2) x',v_table,
          case when v_table='purchase_items' then 'id' when v_table='purchase_receipts' then 'received_at' else 'created_at' end,case when v_table in('purchase_items','suppliers','startup_budgets') then 1000 else 50 end)
          into v_rows using p_shop_id,case when v_table in('purchase_items','suppliers','startup_budgets') then 0 else v_offset end;
      end if;
      v_data:=v_data||jsonb_build_object(v_table,v_rows);
    end loop;
  end if;
  if p_module in('inventory','purchases') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select id,name,base_unit,minimum_stock::text,estimated_unit_cost_cents::text from public.ingredients where shop_id=p_shop_id order by name limit 1000) x;
    v_data:=v_data||jsonb_build_object('ingredients',v_rows);
  end if;
  if p_module in('shifts','settings','pos','orders') then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select id,name,enabled,offline_capable from public.pos_devices where shop_id=p_shop_id order by name) x;
    v_data:=v_data||jsonb_build_object('pos_devices',v_rows);
  end if;
  if p_module='orders' then
    select coalesce(jsonb_agg(to_jsonb(s)),'[]') into v_rows from public.cashier_shifts s where s.shop_id=p_shop_id and s.cashier_id=auth.uid() and s.closed_at is null;
    v_data:=v_data||jsonb_build_object('cashier_shifts',v_rows);
  end if;
  if p_module in('funding','staff') and v_founder then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(select m.user_id,m.role,m.status,p.display_name from public.shop_members m left join public.profiles p on p.user_id=m.user_id where m.shop_id=p_shop_id order by m.created_at) x;
    v_data:=v_data||jsonb_build_object('members',v_rows);
  end if;
  if p_module='funding' and v_founder then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into v_rows from(
      select founder_id,classification,status,sum(amount_cents) amount_cents from public.founder_contributions
      where shop_id=p_shop_id group by founder_id,classification,status order by founder_id,classification,status) x;
    v_data:=v_data||jsonb_build_object('funding_summary',v_rows);
  end if;
  return v_data||jsonb_build_object('page',p_page,'founder',v_founder,'user_id',auth.uid());
end $$;
revoke all on function public.business_report(uuid,date,date),public.get_business_data(uuid,text,integer) from public,anon;
grant execute on function public.business_report(uuid,date,date),public.get_business_data(uuid,text,integer) to authenticated;
