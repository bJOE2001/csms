begin;

create or replace function coffee_catalog_private.read_public_menu(p_shop_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target_shop uuid := p_shop_id;
  published_count bigint;
  catalog jsonb;
  top_ids jsonb;
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

  with available as (
    select
      p.id,
      p.name,
      p.description,
      coalesce(c.name, 'Menu selections') as category,
      case
        when p.image_url ~ '^https://' then p.image_url
        when p.image_url ~ '^/(images|site|uploads)/[a-zA-Z0-9_./%\-]+$'
          and position('..' in p.image_url) = 0 then p.image_url
        else null
      end as safe_image,
      coalesce(sizes.starting_price, p.price_cents) as price,
      sizes.public_sizes as sizes
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
      and (jsonb_array_length(p.sizes) = 0 or jsonb_array_length(sizes.public_sizes) > 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'description', a.description,
    'category', a.category, 'image', a.safe_image,
    'price', a.price, 'sizes', a.sizes
  ) order by a.name, a.id), '[]'::jsonb) into catalog
  from available a;

  with available as (
    select
      p.id,
      p.name,
      (
        case
          when p.image_url ~ '^https://' then p.image_url
          when p.image_url ~ '^/(images|site|uploads)/[a-zA-Z0-9_./%\-]+$'
            and position('..' in p.image_url) = 0 then p.image_url
          else null
        end is not null
      ) as has_image
    from public.pos_products p
    where p.shop_id = target_shop and p.active and p.archived_at is null
      and (
        jsonb_array_length(p.sizes) = 0
        or exists (
          select 1 from jsonb_array_elements(p.sizes) as entry(value)
          where (entry.value->>'active')::boolean
        )
      )
  ),
  ranked as (
    select
      a.id,
      sum(case when (item.value->>'quantity') ~ '^\d+(\.\d+)?$' then (item.value->>'quantity')::numeric else 0 end) as total_qty,
      sum(case when (item.value->>'line_total_cents') ~ '^\d+$' then (item.value->>'line_total_cents')::bigint else 0 end) as total_rev,
      a.has_image,
      a.name
    from public.pos_sales s
    cross join lateral jsonb_array_elements(s.items) as item(value)
    join available a
      on (
        case
          when (item.value->>'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (item.value->>'product_id')::uuid
          else null
        end = a.id
        or (
          nullif(trim(coalesce(item.value->>'product_id', '')), '') is null
          and (
            lower(trim(coalesce(item.value->>'name', ''))) = lower(trim(a.name))
            or lower(trim(split_part(coalesce(item.value->>'name', ''), ' · ', 1))) = lower(trim(a.name))
          )
        )
      )
    where s.shop_id = target_shop and s.status = 'completed'
    group by a.id, a.has_image, a.name
    having sum(case when (item.value->>'quantity') ~ '^\d+(\.\d+)?$' then (item.value->>'quantity')::numeric else 0 end) > 0
    order by total_qty desc, total_rev desc, a.has_image desc, a.name asc
    limit 4
  )
  select coalesce(jsonb_agg(r.id order by r.total_qty desc, r.total_rev desc, r.has_image desc, r.name asc), '[]'::jsonb)
  into top_ids
  from ranked r;

  if jsonb_array_length(top_ids) > 0 then
    return jsonb_build_object('status', 'published', 'products', catalog, 'featured_ids', top_ids);
  end if;
  return jsonb_build_object('status', 'published', 'products', catalog);
end;
$$;

comment on function public.read_public_menu(uuid) is 'Customer-safe catalog and top-selling featured IDs for explicitly published shops. No private product or financial fields or write access.';
notify pgrst, 'reload schema';
commit;
