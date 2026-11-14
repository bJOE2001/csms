begin;

-- Existing receipts retain their business date. Their historical receive time
-- was not recorded separately, so created_at is the best available audit value.
alter table public.pos_sales add column received_at timestamptz;
update public.pos_sales set received_at=created_at;
alter table public.pos_sales alter column received_at set default now();
alter table public.pos_sales alter column received_at set not null;

-- Preserve the validated checkout/inventory transaction as an internal helper.
-- Old clients may omit captured_at throughout the rollout.
alter function public.pos_checkout(uuid,jsonb) rename to pos_checkout_before_offline;
revoke all on function public.pos_checkout_before_offline(uuid,jsonb) from public,anon,authenticated;

create function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sale_id uuid; captured timestamptz; result jsonb;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 sale_id:=(p_data->>'id')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sale_id::text,0));
 -- Replays must keep working after the upload window has elapsed. The existing
 -- helper verifies the original shop, cashier and complete request, including
 -- captured_at, before returning; no stock is consumed a second time.
 if exists(select 1 from public.pos_sales where id=sale_id) then
  return public.pos_checkout_before_offline(p_shop_id,p_data);
 end if;
 if p_data ? 'captured_at' then
  if jsonb_typeof(p_data->'captured_at') is distinct from 'string'
   or (p_data->>'captured_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
   raise exception 'Invalid sale capture time';
  end if;
  begin
   captured:=(p_data->>'captured_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Invalid sale capture time';
  end;
  if captured>now()+interval '5 minutes' or captured<now()-interval '30 days' then
   raise exception 'Sale capture time must be within the last 30 days and no more than 5 minutes ahead. Review this saved sale.';
  end if;
 end if;
 result:=public.pos_checkout_before_offline(p_shop_id,p_data);
 -- created_at remains the business/report/receipt date. received_at records
 -- when production accepted the sale. Inventory uses the active recipe and
 -- stock/cost at acceptance; its immutable movements retain their posting time.
 if captured is not null then update public.pos_sales set created_at=captured where id=sale_id;end if;
 return result;
end $$;

revoke all on function public.pos_checkout(uuid,jsonb) from public,anon;
grant execute on function public.pos_checkout(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

-- Rollback, if required: drop only the new pos_checkout wrapper, rename
-- pos_checkout_before_offline back to pos_checkout, and restore its authenticated
-- EXECUTE grant. Retain received_at and captured business dates as audit data.
commit;
