-- Run after the demo seeder, only in the disposable database test cluster.
do $$
declare
  shop uuid := current_setting('coffee_pos.demo_shop_id')::uuid;
  zone text;
begin
  assert not exists(select 1 from public.ingredients where shop_id=shop);
  assert not exists(select 1 from public.inventory_balances where shop_id=shop);
  assert not exists(select 1 from public.stock_movements where shop_id=shop);
  assert not exists(select 1 from public.pos_stock_documents where shop_id=shop);
  assert not exists(select 1 from public.pos_recipe_versions where shop_id=shop);
  assert not exists(select 1 from public.pos_inventory_configs where shop_id=shop);
  select timezone into zone from public.shops where id=shop;
  assert (select count(*) from public.pos_categories where shop_id=shop)=5;
  assert not exists(select 1 from public.pos_categories where shop_id=shop and name ilike '%demo%');
  assert (select count(*) from public.pos_products where shop_id=shop)=11;
  assert (select count(distinct lower(name)) from public.pos_products where shop_id=shop)=11;
  assert (select count(*) from public.pos_products where shop_id=shop and jsonb_array_length(sizes)>0)=6;
  assert (select count(*) from public.pos_products where shop_id=shop and not active)=1;
  assert not exists(select 1 from public.pos_products p where p.shop_id=shop and
    (p.name ilike '%demo%'
    or (coalesce(p.description,'') ilike '%demo%' and p.description <> '[Demo] Owner-edited description retained.')
    or p.cost_cents is null
    or p.category_id is null
    or not exists(select 1 from public.pos_categories c where c.id=p.category_id and c.shop_id=shop)
    or not public.pos_valid_sizes(p.sizes)));
  assert not exists(select 1 from public.pos_products p, lateral jsonb_array_elements(p.sizes) s
    where p.shop_id=shop and (((s->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$')
    or (s->>'label') ilike '%demo%' or (s->>'cost_cents') is null));
  assert (select count(*) from public.pos_sales where shop_id=shop)>400;
  assert (select count(distinct (created_at at time zone zone)::date) from public.pos_sales where shop_id=shop)=34;
  assert not exists(select 1 from public.pos_sales where shop_id=shop and
    ((created_at at time zone zone)::date not between date '2026-10-01' and date '2026-11-03'
    or total_cost_cents is null
    or coalesce(refund_reason,'') ilike '%demo%'
    or coalesce(cost_note,'') ilike '%demo%'));
  assert exists(select 1 from public.pos_sales where shop_id=shop and method='cash');
  assert exists(select 1 from public.pos_sales where shop_id=shop and method='gcash');
  assert exists(select 1 from public.pos_sales where shop_id=shop and status='refunded');
  assert not exists(select 1 from public.pos_sales where shop_id=shop and status='cancelled');
  assert not exists(select 1 from public.pos_sales where shop_id=shop and
    ((method='cash' and tendered_cents<total_cents) or (method='gcash' and tendered_cents is not null)));
  assert not exists(select 1 from public.pos_sales s where s.shop_id=shop and
    (s.total_cents<>(select sum((i->>'line_total_cents')::bigint) from jsonb_array_elements(s.items) i)
    or s.total_cost_cents<>(select sum((i->>'unit_cost_cents')::bigint*(i->>'quantity')::integer) from jsonb_array_elements(s.items) i)));
  assert not exists(select 1 from public.pos_sales s, lateral jsonb_array_elements(s.items) i where s.shop_id=shop and
    ((i->>'line_total_cents')::bigint<>(i->>'unit_price_cents')::bigint*(i->>'quantity')::integer
    or i->>'name' ilike '%demo%'
    or coalesce(i->>'size_label','') ilike '%demo%'));
  assert exists(select 1 from public.pos_sales s, lateral jsonb_array_elements(s.items) i where s.shop_id=shop and i->>'size_label' is not null);
  assert exists(select 1 from public.pos_expenses where shop_id=shop and voided);
  assert not exists(select 1 from public.pos_expenses where shop_id=shop and
    (spent_on not between date '2026-10-01' and date '2026-11-03' or description ilike '%demo%'));
end $$;

-- The database readers used by the application return the complete inclusive range.
select set_config('request.jwt.claim.sub',
  (select user_id::text from public.shop_members where shop_id=current_setting('coffee_pos.demo_shop_id')::uuid and role='founder' limit 1),false);
do $$ declare shop uuid:=current_setting('coffee_pos.demo_shop_id')::uuid; begin
  assert jsonb_array_length(public.pos_sales(shop,'2026-10-01','2026-11-03'))=(select count(*) from public.pos_sales where shop_id=shop);
  assert jsonb_array_length(public.pos_expenses(shop,'2026-10-01','2026-11-03'))=(select count(*) from public.pos_expenses where shop_id=shop);
end $$;
