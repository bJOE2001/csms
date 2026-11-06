begin;

-- Publishing is explicit. Existing shops and newly created shops remain private by default.
alter table public.shops add column if not exists public_menu_enabled boolean not null default false;
comment on column public.shops.public_menu_enabled is 'Owner opt-in for the read-only public product catalog.';

-- Keep privileged implementation details outside Supabase's exposed schemas.
create schema if not exists coffee_catalog_private;
revoke all on schema coffee_catalog_private from public, anon, authenticated;
grant usage on schema coffee_catalog_private to anon, authenticated;

create or replace function coffee_catalog_private.read_public_menu(p_shop_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target_shop uuid := p_shop_id;
  published_count bigint;
  catalog jsonb;
begin
  if target_shop is null then
    select count(*), min(s.id::text)::uuid into published_count, target_shop
      from public.shops s where s.public_menu_enabled;
    if published_count <> 1 then
      return jsonb_build_object('status', 'unpublished', 'products', '[]'::jsonb);
    end if;
  end if;
  if not exists (select 1 from public.shops s where s.id = target_shop and s.public_menu_enabled) then
    return jsonb_build_object('status', 'unpublished', 'products', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'description', p.description,
    'category', coalesce(c.name, 'Menu selections'),
    'image', case
      when p.image_url ~ '^https://' then p.image_url
      when p.image_url ~ '^/(images|site|uploads)/[a-zA-Z0-9_./%\-]+$'
        and position('..' in p.image_url) = 0 then p.image_url
      else null
    end,
    'price', coalesce(sizes.starting_price, p.price_cents),
    'sizes', sizes.public_sizes
  ) order by p.name, p.id), '[]'::jsonb) into catalog
  from public.pos_products p
  left join public.pos_categories c on c.id = p.category_id and c.shop_id = p.shop_id
  cross join lateral (
    select min((entry.value->>'price_cents')::bigint) as starting_price,
      coalesce(jsonb_agg(jsonb_build_object(
        'label', entry.value->>'label', 'price', (entry.value->>'price_cents')::bigint
      ) order by entry.ordinality), '[]'::jsonb) as public_sizes
    from jsonb_array_elements(p.sizes) with ordinality as entry(value, ordinality)
    where (entry.value->>'active')::boolean
  ) sizes
  where p.shop_id = target_shop and p.active and p.archived_at is null
    and (jsonb_array_length(p.sizes) = 0 or jsonb_array_length(sizes.public_sizes) > 0);

  return jsonb_build_object('status', 'published', 'products', catalog);
end;
$$;

-- The exposed RPC runs as the caller and delegates only this fixed, read-only projection.
create or replace function public.read_public_menu(p_shop_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coffee_catalog_private.read_public_menu(p_shop_id);
$$;
revoke all on function coffee_catalog_private.read_public_menu(uuid) from public, anon, authenticated;
revoke all on function public.read_public_menu(uuid) from public, anon, authenticated;
grant execute on function coffee_catalog_private.read_public_menu(uuid) to anon, authenticated;
grant execute on function public.read_public_menu(uuid) to anon, authenticated;

-- No anonymous grants or policies are added to shops, products, sizes, categories or financial tables.
comment on function public.read_public_menu(uuid) is 'Customer-safe catalog for explicitly published shops. No private product fields or write access.';
notify pgrst, 'reload schema';
commit;
