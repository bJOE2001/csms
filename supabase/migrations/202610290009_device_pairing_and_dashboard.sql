alter table public.pos_devices add column browser_key_hash text;
create function public.pair_pos_device(p_shop_id uuid,p_device_id uuid,p_browser_key text) returns void
language plpgsql security definer set search_path='' as $$begin
  perform public.require_business_access(p_shop_id);
  if p_browser_key is null or length(p_browser_key) not between 32 and 128 then raise exception 'Invalid browser registration'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  if exists(select 1 from public.cashier_shifts where device_id=p_device_id and shop_id=p_shop_id and closed_at is null) then raise exception 'Close the device shift before pairing or replacing its browser'; end if;
  update public.pos_devices set browser_key_hash=encode(sha256(convert_to(p_browser_key,'UTF8')),'hex') where shop_id=p_shop_id and id=p_device_id and enabled;
  if not found then raise exception 'Enabled device not found'; end if;
  perform public.record_business_audit(p_shop_id,'device.browser_paired','device',p_device_id,'{}');
end $$;
-- Keep the original implementation private; offline leases require possession of
-- the paired browser's revocable random key as well as a valid user session.
alter function public.open_pos_session(uuid,uuid,uuid) rename to open_pos_session_internal;
revoke all on function public.open_pos_session_internal(uuid,uuid,uuid) from public,anon,authenticated;
create function public.open_pos_session(p_shop_id uuid,p_device_id uuid,p_shift_id uuid,p_browser_key text default null,p_last_sequence integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare v_device public.pos_devices%rowtype;v_session public.pos_sessions%rowtype;begin
  perform public.require_business_access(p_shop_id,false);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id,false);
  select * into strict v_device from public.pos_devices where shop_id=p_shop_id and id=p_device_id and enabled;
  if v_device.offline_capable and (v_device.browser_key_hash is null or p_browser_key is null or v_device.browser_key_hash<>encode(sha256(convert_to(p_browser_key,'UTF8')),'hex')) then
    raise exception 'A founder must pair this browser to the offline device before opening its shift'; end if;
  if p_last_sequence is not null then
    select * into strict v_session from public.pos_sessions where shift_id=p_shift_id and shop_id=p_shop_id and user_id=auth.uid() and closed_sequence is null for update;
    if p_last_sequence<0 or (select count(*) from public.orders where session_id=v_session.id)<>p_last_sequence
      or coalesce((select max(sequence) from public.orders where session_id=v_session.id),0)<>p_last_sequence then raise exception 'Synchronize every local order before refreshing the menu'; end if;
    update public.pos_sessions set closed_sequence=p_last_sequence where id=v_session.id;
  end if;
  return public.open_pos_session_internal(p_shop_id,p_device_id,p_shift_id);
end $$;
create function public.workspace_dashboard(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
  perform public.require_business_access(p_shop_id);
  return jsonb_build_object('planned_budget_cents',coalesce((select sum(planned_cents) from public.startup_budgets where shop_id=p_shop_id),0),
    'actual_spending_cents',coalesce((select sum(amount_cents) from public.expenses where shop_id=p_shop_id and status='approved'),0),
    'confirmed_funding_cents',coalesce((select sum(amount_cents) from public.founder_contributions where shop_id=p_shop_id and status='confirmed'),0),
    'pending_funding_cents',coalesce((select sum(amount_cents) from public.founder_contributions where shop_id=p_shop_id and status='pending'),0),
    'products',(select count(*) from public.products where shop_id=p_shop_id),'available_variants',(select count(*) from public.product_variants where shop_id=p_shop_id and available),
    'ingredients',(select count(*) from public.ingredients where shop_id=p_shop_id),'stock_entries',(select count(*) from public.inventory_balances where shop_id=p_shop_id),
    'orders',(select count(*) from public.orders where shop_id=p_shop_id),'pending_payments',(select count(*) from public.payments where shop_id=p_shop_id and status='pending'),
    'unresolved_shifts',(select count(*) from public.cashier_shifts where shop_id=p_shop_id and unresolved));
end $$;
revoke all on function public.pair_pos_device(uuid,uuid,text),public.open_pos_session(uuid,uuid,uuid,text,integer),public.workspace_dashboard(uuid) from public,anon;
grant execute on function public.pair_pos_device(uuid,uuid,text),public.open_pos_session(uuid,uuid,uuid,text,integer),public.workspace_dashboard(uuid) to authenticated;
