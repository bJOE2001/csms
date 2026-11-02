create function public.review_cashier_shift(p_shop_id uuid,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_shift public.cashier_shifts%rowtype;v_expected bigint;
begin
  perform public.require_business_access(p_shop_id);
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'shift.review',p_data);if v_result is not null then return v_result;end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  select * into strict v_shift from public.cashier_shifts where shop_id=p_shop_id and id=(p_data->>'shift_id')::uuid and closed_at is not null for update;
  if length(trim(coalesce(p_data->>'reason',''))) not between 1 and 500 then raise exception 'Reconciliation explanation required';end if;
  if exists(select 1 from public.payments p join public.orders o on o.id=p.order_id where o.shift_id=v_shift.id and p.status='pending')
    or exists(select 1 from public.cash_movements where shift_id=v_shift.id and status='pending') then raise exception 'Resolve pending financial records first';end if;
  select v_shift.opening_cents+coalesce((select sum(p.amount_cents) from public.payments p join public.orders o on o.id=p.order_id where o.shift_id=v_shift.id and p.method='cash' and p.status in('confirmed','refunded')),0)
    -coalesce((select sum(cash_refund_cents) from public.order_events where shift_id=v_shift.id),0)
    +coalesce((select sum(amount_cents) from public.cash_movements where shift_id=v_shift.id and status='approved'),0) into v_expected;
  update public.cashier_shifts set expected_cents=v_expected,unresolved=false where id=v_shift.id;
  perform public.record_business_audit(p_shop_id,'shift.reviewed','shift',v_shift.id,p_data||jsonb_build_object('before',to_jsonb(v_shift),'reviewed_expected_cents',v_expected));
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_shift.id,'expected_cents',v_expected));
end $$;
revoke all on function public.review_cashier_shift(uuid,jsonb,uuid) from public,anon;
grant execute on function public.review_cashier_shift(uuid,jsonb,uuid) to authenticated;
