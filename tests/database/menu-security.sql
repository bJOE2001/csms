\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select public.create_shop('Test A') as shop_a \gset
select public.create_menu_category(:'shop_a', 'Coffee') as cat_a \gset
select public.create_menu_product(:'shop_a', :'cat_a', 'Latte', 'Regular', 12500) as product_a \gset
select id as variant_a from public.product_variants where product_id = :'product_a' \gset
select set_config('test.shop_a', :'shop_a', true), set_config('test.variant_a', :'variant_a', true);
insert into public.pos_devices(shop_id, name, offline_capable) values (:'shop_a', 'Test POS', true);
do $$ begin
  begin perform public.create_shop('Duplicate bootstrap'); raise exception 'Repeated shop creation was allowed';
  exception when raise_exception then if sqlerrm <> 'This account already belongs to a shop' then raise; end if; end;
  begin
    perform public.set_variant_available(current_setting('test.shop_a')::uuid, current_setting('test.variant_a')::uuid, true);
    raise exception 'Variant without recipe was enabled';
  exception when raise_exception then if sqlerrm <> 'Publish a recipe before enabling this variant' then raise; end if; end;
  begin
    insert into public.pos_devices(shop_id, name, offline_capable) values (current_setting('test.shop_a')::uuid, 'Second offline POS', true);
    raise exception 'Multiple active offline devices were allowed';
  exception when unique_violation then null; end;
  begin delete from public.pos_devices; raise exception 'Device history could be deleted';
  exception when insufficient_privilege then null; end;
  begin update public.shops set timezone = 'Invalid/Timezone'; raise exception 'Invalid timezone update accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid timezone' then raise; end if; end;
  begin update public.shops set created_at = created_at + interval '1 day'; raise exception 'Creation history changed';
  exception when raise_exception then if sqlerrm <> 'Shop identity and original creation details cannot be changed' then raise; end if; end;
end $$;
select public.create_ingredient(:'shop_a', 'Beans', 'g', 60, 100) as beans_a \gset
select public.publish_recipe(:'shop_a', :'variant_a', jsonb_build_array(jsonb_build_object('ingredient_id', :'beans_a', 'quantity', '18', 'waste_bps', 500))) as recipe_a \gset
select public.publish_product_price(:'shop_a', :'variant_a', 13500);
select public.revise_ingredient_estimate(:'shop_a', :'beans_a', 70);
select public.publish_recipe(:'shop_a', :'variant_a', jsonb_build_array(jsonb_build_object('ingredient_id', :'beans_a', 'quantity', '18', 'waste_bps', 500)));
select set_config('test.beans_a', :'beans_a', true);

do $$ begin
  if (select count(*) from public.product_prices) <> 2 then raise exception 'Price versions were not preserved'; end if;
  if (select price_cents from public.product_prices where version = 1) <> 12500 then raise exception 'Historical price changed'; end if;
  if (select estimated_cost_cents from public.recipes where version = 1) <> 1134 then raise exception 'Recipe cost did not reconcile'; end if;
  if (select estimated_cost_cents from public.recipes where version = 2) <> 1323 then raise exception 'New estimate did not create a distinct recipe cost snapshot'; end if;
  if (select count(*) from public.audit_logs) < 5 then raise exception 'Audit events missing'; end if;
  if not exists (select 1 from public.audit_logs where action = 'shops.insert') then raise exception 'Shop bootstrap audit missing'; end if;
  begin
    perform public.publish_recipe(current_setting('test.shop_a')::uuid, current_setting('test.variant_a')::uuid,
      jsonb_build_array(jsonb_build_object('ingredient_id', current_setting('test.beans_a'), 'quantity', '1', 'waste_bps', 0),
        jsonb_build_object('ingredient_id', current_setting('test.beans_a'), 'quantity', '2', 'waste_bps', 0)));
    raise exception 'Duplicate recipe ingredient was accepted';
  exception when unique_violation then null; end;
  if (select count(*) from public.recipes) <> 2 then raise exception 'Failed recipe publication left partial records'; end if;
  begin
    perform public.create_ingredient(current_setting('test.shop_a')::uuid, 'Invalid numeric', 'g', 'NaN'::numeric, 0);
    raise exception 'NaN ingredient cost was accepted';
  exception when check_violation then null; end;
  begin
    insert into public.ingredients(shop_id, name, base_unit) select id, 'Unauthorized', 'g' from public.shops limit 1;
    raise exception 'Direct ingredient write was allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- Create a second shop using a different identity.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  begin perform public.create_shop('Invalid timezone', 'Not/A_Timezone'); raise exception 'Invalid timezone accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid timezone' then raise; end if; end;
end $$;
select public.create_shop('Test B') as shop_b \gset
select public.create_menu_category(:'shop_b', 'Shop B category') as cat_b \gset
select public.create_ingredient(:'shop_b', 'Shop B ingredient', 'ml', null, 0) as ingredient_b \gset
do $$ begin
  if (select count(*) from public.shops) <> 1 then raise exception 'Cross-shop shop read leaked'; end if;
  if exists (select 1 from public.products) then raise exception 'Cross-shop product read leaked'; end if;
  if exists (select 1 from public.recipes) then raise exception 'Cross-shop recipe read leaked'; end if;
  if (select count(*) from public.ingredients) <> 1 then raise exception 'Cross-shop ingredient read leaked'; end if;
end $$;

reset role;
insert into public.shop_members(shop_id, user_id, role)
values (:'shop_a', '00000000-0000-4000-8000-000000000003', 'staff');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
do $$ declare v_shop uuid; begin
  if exists (select 1 from public.ingredients) then raise exception 'Staff read ingredient cost estimates'; end if;
  if exists (select 1 from public.recipes) then raise exception 'Staff read restricted recipe costs'; end if;
  if exists (select 1 from public.audit_logs) then raise exception 'Staff read restricted audit logs'; end if;
  if (select count(*) from public.product_prices) <> 2 then raise exception 'Staff cannot read own shop prices'; end if;
  select shop_id into v_shop from public.shop_members where user_id = auth.uid();
  begin
    perform public.create_menu_category(v_shop, 'Staff escalation');
    raise exception 'Staff mutation was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.shop_members set role = 'founder' where user_id = auth.uid();
    raise exception 'Staff role escalation was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pos_devices(shop_id, name) values (v_shop, 'Staff-created POS');
    raise exception 'Staff device mutation was allowed';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
-- psql variables cannot appear inside DO bodies; use transaction-local test settings.
select set_config('test.shop_a', :'shop_a', true), set_config('test.cat_b', :'cat_b', true),
  set_config('test.variant_a', :'variant_a', true), set_config('test.ingredient_b', :'ingredient_b', true),
  set_config('test.beans_a', :'beans_a', true);
do $$ begin
  begin
    perform public.create_menu_product(current_setting('test.shop_a')::uuid, current_setting('test.cat_b')::uuid, 'Invalid cross-shop', 'Regular', 100);
    raise exception 'Cross-shop category reference was accepted';
  exception when foreign_key_violation then null; end;
  begin
    perform public.publish_recipe(current_setting('test.shop_a')::uuid, current_setting('test.variant_a')::uuid,
      jsonb_build_array(jsonb_build_object('ingredient_id', current_setting('test.ingredient_b'), 'quantity', '1', 'waste_bps', 0)));
    raise exception 'Cross-shop recipe ingredient was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Ingredient not found in this shop' then raise; end if;
  end;
  begin
    perform public.publish_recipe(current_setting('test.shop_a')::uuid, current_setting('test.variant_a')::uuid,
      jsonb_build_array(jsonb_build_object('ingredient_id', current_setting('test.beans_a'), 'quantity', '1.0000001', 'waste_bps', 0)));
    raise exception 'Excess precision was silently rounded';
  exception when raise_exception then
    if sqlerrm <> 'Invalid recipe quantity or waste allowance' then raise; end if;
  end;
end $$;

-- History is protected even against accidental writes by the table owner.
reset role;
do $$ begin
  begin update public.product_prices set price_cents = 1; raise exception 'Price history was mutable';
  exception when sqlstate '55000' then null; end;
  begin delete from public.recipes; raise exception 'Recipe history was deletable';
  exception when sqlstate '55000' then null; end;
  begin delete from public.audit_logs; raise exception 'Audit history was deletable';
  exception when sqlstate '55000' then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform count(*) from public.products; raise exception 'Anonymous table read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS: price history, recipe costing, audit immutability, staff restrictions, and cross-shop isolation'
