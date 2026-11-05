-- Remove old cancellation examples with their original demo identifiers and markers.
-- Run in Supabase SQL Editor as postgres. Genuine historical receipts are retained.
-- For multiple shops, uncomment and select the intended demo shop:
-- select set_config('coffee_pos.demo_shop_id', 'YOUR-SHOP-UUID', false);

begin;

create or replace function pg_temp.coffee_demo_id(shop uuid, label text)
returns uuid language sql immutable as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select md5('coffee-pos-demo-2026-v1|'||shop::text||'|'||label) h) digest;
$$;

do $cleanup$
declare
  target_shop uuid := nullif(current_setting('coffee_pos.demo_shop_id', true), '')::uuid;
  shop_count integer;
  shop_zone text;
  day date;
  order_number integer;
  orders_today integer;
  sequence_number integer := 0;
  affected integer;
  removed integer := 0;
begin
  if target_shop is null then
    select count(*), (array_agg(id))[1] into shop_count, target_shop from public.shops;
    if shop_count <> 1 then
      raise exception 'Select a shop with coffee_pos.demo_shop_id; found % shops', shop_count;
    end if;
  end if;
  select timezone into shop_zone from public.shops where id = target_shop;
  if not found then raise exception 'The selected demo shop does not exist'; end if;
  perform pg_advisory_xact_lock(hashtextextended('coffee-pos-demo:'||target_shop::text, 0));

  for day in select generate_series(date '2026-10-01', date '2026-11-03', interval '1 day')::date loop
    orders_today := 12 + (day-date '2026-10-01') % 5 + case when extract(isodow from day) >= 6 then 4 else 0 end;
    for order_number in 1..orders_today loop
      sequence_number := sequence_number + 1;
      if sequence_number % 97 <> 0 then continue; end if;
      delete from public.pos_sales s
      where s.shop_id = target_shop
        and s.id = pg_temp.coffee_demo_id(target_shop, 'sale:'||day::text||':'||order_number)
        and (s.created_at at time zone shop_zone)::date = day
        and s.status = 'cancelled' and s.payment_status = 'cancelled'
        and s.refund_reason = '[Demo] Order cancelled before preparation'
        and s.refunded_at is null and s.refunded_by is null
        and s.cost_recorded_at is null and s.cost_recorded_by is null and s.cost_note is null
        and s.request->>'id' = s.id::text
        and jsonb_array_length(s.items) > 0
        and not exists(select 1 from jsonb_array_elements(s.items) item
          where coalesce(item->>'name', '') not like '[Demo] %');
      get diagnostics affected = row_count;
      removed := removed + affected;
    end loop;
  end loop;
  perform set_config('coffee_pos.demo_cleanup_count', removed::text, true);
end;
$cleanup$;

select current_setting('coffee_pos.demo_cleanup_count')::integer as removed_demo_cancellations;
commit;
