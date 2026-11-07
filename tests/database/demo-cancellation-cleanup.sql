-- Recreate old seeded cancellations and verify narrow cleanup guards locally.
create temp table old_demo_cancellations as
with days as (
  select day::date, 12 + (day::date-date '2026-10-01') % 5
    + case when extract(isodow from day) >= 6 then 4 else 0 end as orders_today
  from generate_series(date '2026-10-01', date '2026-11-03', interval '1 day') day
), numbered as (
  select day, n, row_number() over(order by day, n) as sequence_number
  from days cross join lateral generate_series(1, orders_today) n
)
select pg_temp.coffee_demo_id(current_setting('coffee_pos.demo_shop_id')::uuid,
  'sale:'||day::text||':'||n) as id, row_number() over(order by day, n) as fixture_number
from numbered where sequence_number % 97 = 0;

update public.pos_sales set status='cancelled',payment_status='cancelled',
  refund_reason='[Demo] Order cancelled before preparation'
where id in(select id from old_demo_cancellations);
-- The current sample seed uses clean names; recreate the old markers only in this isolated fixture.
update public.pos_sales s set items=(select jsonb_agg(item||jsonb_build_object('name','[Demo] '||(item->>'name'))) from jsonb_array_elements(s.items) item)
where id in(select id from old_demo_cancellations);
-- Changed reasons and non-demo items must survive even when identifiers match the old seed.
update public.pos_sales set refund_reason='Owner-maintained historical cancellation'
where id=(select id from old_demo_cancellations where fixture_number=1);
update public.pos_sales set items=jsonb_set(items,'{0,name}','"Genuine historical product"')
where id=(select id from old_demo_cancellations where fixture_number=2);
-- Matching names and reason alone must never identify a record for deletion.
insert into public.pos_sales(id,shop_id,created_by,created_at,total_cents,method,status,payment_status,items,refund_reason)
select '00000000-0000-4000-8000-000000000778',shop_id,created_by,created_at,total_cents,method,status,payment_status,items,
  '[Demo] Order cancelled before preparation'
from public.pos_sales where id=(select id from old_demo_cancellations where fixture_number=3);
create temp table cleanup_protected as
select id,to_jsonb(s) snapshot from public.pos_sales s
where id not in(select id from old_demo_cancellations where fixture_number>2);
