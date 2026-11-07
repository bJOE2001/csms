-- LOGO development sample data: October 1 through November 3, 2026, in the shop's timezone.
-- Run in Supabase SQL Editor as postgres, after all application migrations, in development only.
-- Existing rows are never overwritten; inventory items, stock balances and active recipes remain empty.
-- Explicit opt-in: select set_config('coffee_pos.allow_sample_data','on',false);
-- If there is more than one shop, uncomment and set your intended development shop:
-- select set_config('coffee_pos.demo_shop_id', 'YOUR-SHOP-UUID', false);

begin;
do $$begin if current_setting('coffee_pos.allow_sample_data',true) is distinct from 'on' then raise exception 'Sample data is opt-in: set coffee_pos.allow_sample_data to on in a development database';end if;end $$;

-- Deterministic UUID v4 identifiers, scoped to this shop and this demo dataset.
create or replace function pg_temp.coffee_demo_id(shop uuid, label text)
returns uuid language sql immutable as $$
  select (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
  from (select md5('coffee-pos-demo-2026-v1|'||shop::text||'|'||label) h) digest;
$$;

do $seed$
declare
  target_shop uuid := nullif(current_setting('coffee_pos.demo_shop_id', true), '')::uuid;
  owner_id uuid;
  shop_zone text;
  shop_count integer;
  first_day constant date := date '2026-10-01';
  last_day constant date := date '2026-11-03';
  category_name text;
  category_id uuid;
  definition jsonb;
  configured jsonb;
  size_definition jsonb;
  chosen_size jsonb;
  product public.pos_products;
  product_id uuid;
  drink_ids uuid[] := '{}';
  food_ids uuid[] := '{}';
  category_ids uuid[] := '{}';
  product_ids uuid[] := '{}';
  sale_ids uuid[] := '{}';
  expense_ids uuid[] := '{}';
  sale_id uuid;
  expense_id uuid;
  day_offset integer;
  order_number integer;
  orders_today integer;
  sequence_number integer := 0;
  line_number integer;
  quantity integer;
  price bigint;
  total bigint;
  method text;
  lines jsonb;
  line jsonb;
  payload jsonb;
  occurred_at timestamptz;
  expense_kind text;
  expense_amount bigint;
  revenue bigint;
  product_costs bigint;
  overhead bigint;
begin
  if to_regclass('public.pos_categories') is null
    or to_regprocedure('public.pos_checkout(uuid,jsonb)') is null then
    raise exception 'Apply the application migrations before running this demo seeder';
  end if;
  if target_shop is null then
    select count(*), (array_agg(id))[1] into shop_count, target_shop from public.shops;
    if shop_count <> 1 then
      raise exception 'Select a shop with coffee_pos.demo_shop_id; found % shops', shop_count;
    end if;
  end if;
  select timezone into shop_zone from public.shops where id = target_shop;
  if not found then raise exception 'The selected demo shop does not exist'; end if;
  select user_id into owner_id from public.shop_members
    where shop_id = target_shop and role = 'founder' and status = 'active'
    order by created_at limit 1;
  if owner_id is null then raise exception 'Create a shop with an active owner before seeding'; end if;

  perform pg_advisory_xact_lock(hashtextextended('coffee-pos-demo:'||target_shop::text, 0));
  -- Transaction-local actor for the existing permission-checked business functions.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  foreach category_name in array array['Coffee','Non-Coffee','Food','Snacks','Desserts'] loop
    category_id := pg_temp.coffee_demo_id(target_shop, 'category:'||category_name);
    category_ids := array_append(category_ids, category_id);
    if not exists(select 1 from public.pos_categories where id = category_id) then
      perform public.pos_save_category(target_shop,
        jsonb_build_object('id',category_id,'name',category_name));
    end if;
  end loop;

  for definition in select value from jsonb_array_elements($catalog$[
    {"name":"Americano","category":"Coffee","description":"Espresso and water.","price":11000,"cost":3500,"sizes":[{"label":"8 oz","price":9500,"cost":2800},{"label":"12 oz","price":11000,"cost":3500},{"label":"16 oz","price":13000,"cost":4200}]},
    {"name":"Cafe Latte","category":"Coffee","description":"Espresso with steamed milk.","price":13000,"cost":4500,"sizes":[{"label":"12 oz","price":13000,"cost":4500},{"label":"16 oz","price":15000,"cost":5500},{"label":"22 oz","price":17500,"cost":6500,"active":false}]},
    {"name":"Cappuccino","category":"Coffee","description":"Espresso, milk and foam.","price":12000,"cost":3800,"sizes":[{"label":"8 oz","price":12000,"cost":3800},{"label":"12 oz","price":14000,"cost":4800}]},
    {"name":"Mocha","category":"Coffee","description":"Coffee with chocolate and milk.","price":14500,"cost":5000,"sizes":[{"label":"12 oz","price":14500,"cost":5000},{"label":"16 oz","price":16500,"cost":6200},{"label":"22 oz","price":18500,"cost":7200}]},
    {"name":"Matcha Latte","category":"Non-Coffee","description":"Matcha with milk.","price":15500,"cost":6500,"sizes":[{"label":"12 oz","price":15500,"cost":6500},{"label":"16 oz","price":17500,"cost":7800}]},
    {"name":"Iced Chocolate","category":"Non-Coffee","description":"Chocolate and milk over ice.","price":12000,"cost":4500,"sizes":[{"label":"12 oz","price":12000,"cost":4500},{"label":"16 oz","price":14000,"cost":5500}]},
    {"name":"Butter Croissant","category":"Food","description":"One pastry.","price":8500,"cost":3500},
    {"name":"Ham and Cheese Sandwich","category":"Food","description":"One sandwich.","price":14000,"cost":7000},
    {"name":"Chocolate Chip Cookie","category":"Snacks","description":"One cookie.","price":5500,"cost":2000},
    {"name":"Brownie","category":"Desserts","description":"One brownie.","price":8000,"cost":3200},
    {"name":"Pumpkin Spice Latte","category":"Coffee","description":"Seasonal item, currently unavailable.","price":16500,"cost":6000,"active":false}
  ]$catalog$::jsonb) loop
    product_id := pg_temp.coffee_demo_id(target_shop, 'product:'||(definition->>'name'));
    product_ids := array_append(product_ids, product_id);
    if coalesce((definition->>'active')::boolean, true) then
      if definition ? 'sizes' then drink_ids := array_append(drink_ids, product_id);
      else food_ids := array_append(food_ids, product_id); end if;
    end if;
    configured := '[]';
    for size_definition in select value from jsonb_array_elements(coalesce(definition->'sizes','[]')) loop
      configured := configured || jsonb_build_array(jsonb_build_object(
        'id',pg_temp.coffee_demo_id(target_shop,'size:'||(definition->>'name')||':'||(size_definition->>'label')),
        'label',size_definition->>'label','price_cents',(size_definition->>'price')::bigint,
        'cost_cents',(size_definition->>'cost')::bigint,
        'active',coalesce((size_definition->>'active')::boolean,true),
        'is_default',jsonb_array_length(configured)=0));
    end loop;
    if not exists(select 1 from public.pos_products where id = product_id) then
      perform public.pos_save_product(target_shop, jsonb_build_object(
        'id',product_id,'name',(definition->>'name'),
        'category_id',pg_temp.coffee_demo_id(target_shop,'category:'||(definition->>'category')),
        'description',(definition->>'description'),
        'price_cents',(definition->>'price')::bigint,'cost_cents',(definition->>'cost')::bigint,
        'active',coalesce((definition->>'active')::boolean,true),'sizes',configured));
    end if;
  end loop;

  for day_offset in 0..(last_day-first_day) loop
    orders_today := 12 + day_offset % 5 + case when extract(isodow from first_day+day_offset) >= 6 then 4 else 0 end;
    for order_number in 1..orders_today loop
      sequence_number := sequence_number + 1;
      sale_id := pg_temp.coffee_demo_id(target_shop,'sale:'||(first_day+day_offset)::text||':'||order_number);
      sale_ids := array_append(sale_ids, sale_id);
      if exists(select 1 from public.pos_sales where id = sale_id) then continue; end if;
      lines := '[]'; total := 0;
      -- One drink, with an additional food item on every third order.
      for line_number in 1..case when order_number % 3 = 0 then 2 else 1 end loop
        product_id := case when line_number=1
          then drink_ids[1+(day_offset*7+order_number)%array_length(drink_ids,1)]
          else food_ids[1+(day_offset+order_number)%array_length(food_ids,1)] end;
        select * into strict product from public.pos_products where id = product_id and shop_id = target_shop;
        quantity := case when line_number=1 and order_number%5=0 then 2 else 1 end;
        price := product.price_cents;
        line := jsonb_build_object('product_id',product.id,'quantity',quantity);
        if jsonb_array_length(product.sizes)>0 then
          select value into strict chosen_size from jsonb_array_elements(product.sizes) with ordinality
            where (value->>'active')::boolean order by ordinality
            offset (day_offset+order_number) % (select count(*) from jsonb_array_elements(product.sizes) where (value->>'active')::boolean)
            limit 1;
          price := (chosen_size->>'price_cents')::bigint;
          line := line || jsonb_build_object('size_id',chosen_size->>'id','size_label',chosen_size->>'label');
        end if;
        lines := lines || jsonb_build_array(line || jsonb_build_object('price_cents',price));
        total := total + price*quantity;
      end loop;
      method := case when sequence_number%5 in (0,1) then 'gcash' else 'cash' end;
      payload := jsonb_build_object('id',sale_id,'method',method,'items',lines);
      if method='cash' then
        payload := payload || jsonb_build_object('tendered_cents',
          case when order_number%4=0 then total else ceil(total/5000.0)::bigint*5000 end);
      end if;
      perform public.pos_checkout(target_shop, payload);
      occurred_at := (first_day+day_offset+time '08:00' + make_interval(mins => (order_number-1)*600/orders_today)) at time zone shop_zone;
      update public.pos_sales set created_at=occurred_at where id=sale_id;
      if sequence_number%41=0 then
        perform public.pos_refund(target_shop,sale_id,'Customer returned an incorrect drink');
        update public.pos_sales set refunded_at=occurred_at+interval '15 minutes' where id=sale_id;
      end if;
    end loop;

    for expense_kind, expense_amount in
      select 'GCash transaction fees', (25+day_offset%6*5)*100::bigint
      union all select 'Shop rent',1000000 where extract(day from first_day+day_offset)=1
      union all select 'Staff wages',650000 where first_day+day_offset in (date '2026-10-15',date '2026-10-30')
      union all select 'Electricity and water',280000 where first_day+day_offset=date '2026-10-20'
      union all select 'Internet',150000 where first_day+day_offset in (date '2026-10-03',date '2026-11-03')
      union all select 'Cleaning supplies',45000 where extract(isodow from first_day+day_offset)=1
      union all select 'Equipment maintenance',90000 where first_day+day_offset=date '2026-10-23'
      union all select 'Permit fee',65000 where first_day+day_offset=date '2026-10-07'
      union all select 'Duplicate utility entry (voided)',180000 where first_day+day_offset=date '2026-10-10'
    loop
      expense_id := pg_temp.coffee_demo_id(target_shop,'expense:'||(first_day+day_offset)::text||':'||'[Demo] '||expense_kind);
      expense_ids := array_append(expense_ids, expense_id);
      if exists(select 1 from public.pos_expenses where id=expense_id) then continue; end if;
      -- Keep the original expense-kind identifier so renamed display text does not duplicate seeded expenses.
      perform public.pos_add_expense(target_shop,jsonb_build_object('id',expense_id,
        'spent_on',first_day+day_offset,'description',replace(expense_kind,'GCash transaction fees','E-wallet transaction fees'),'amount_cents',expense_amount));
      update public.pos_expenses set created_at=(first_day+day_offset+time '18:00') at time zone shop_zone where id=expense_id;
      if expense_kind='Duplicate utility entry (voided)' then
        perform public.pos_void_expense(target_shop,expense_id);
      end if;
    end loop;
  end loop;

  select coalesce(sum(total_cents) filter(where status='completed'),0),
    coalesce(sum(total_cost_cents) filter(where status in ('completed','refunded')),0)
    into revenue,product_costs from public.pos_sales where id=any(sale_ids);
  select coalesce(sum(amount_cents) filter(where not voided),0) into overhead
    from public.pos_expenses where id=any(expense_ids);
  perform set_config('coffee_pos.demo_summary',jsonb_build_object(
    'shop_id',target_shop,'from',first_day,'to',last_day,'timezone',shop_zone,
    'categories',array_length(category_ids,1),'products',array_length(product_ids,1),
    'sales',array_length(sale_ids,1),'expenses',array_length(expense_ids,1),
    'revenue_php',revenue/100.0,'product_costs_php',product_costs/100.0,
    'gross_profit_php',(revenue-product_costs)/100.0,'expenses_php',overhead/100.0,
    'net_profit_php',(revenue-product_costs-overhead)/100.0)::text,true);
end;
$seed$;

select jsonb_pretty(current_setting('coffee_pos.demo_summary')::jsonb) as sample_seed_summary;
commit;
