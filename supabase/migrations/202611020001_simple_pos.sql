begin;
-- Online POS and sales. Historical migrations remain the upgrade ledger.
-- Existing business data is never dropped by this migration.
create table public.pos_products (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id),
 name text not null check(length(trim(name)) between 1 and 120), price_cents bigint not null check(price_cents between 0 and 9007199254740991), active boolean not null default true
);
create table public.pos_sales (
 id uuid primary key, shop_id uuid not null references public.shops(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), total_cents bigint not null check(total_cents between 0 and 9007199254740991),
 method text not null, tendered_cents bigint, status text not null default 'completed' check(status in ('completed','refunded','cancelled')),
 payment_status text not null default 'confirmed', items jsonb not null check(jsonb_typeof(items)='array'), request jsonb,
 refund_reason text, refunded_by uuid references auth.users(id), refunded_at timestamptz
);
create index pos_sales_shop_time on public.pos_sales(shop_id,created_at desc);
alter table public.pos_products enable row level security;
alter table public.pos_sales enable row level security;
create policy pos_products_read on public.pos_products for select to authenticated using(public.is_shop_member(shop_id));
create policy pos_sales_read on public.pos_sales for select to authenticated using(public.is_shop_member(shop_id));
revoke all on public.pos_products,public.pos_sales from public,anon,authenticated;
grant select on public.pos_products,public.pos_sales to authenticated;

-- Copy the current menu and receipts, including snapshots and reversal status.
insert into public.pos_products(id,shop_id,name,price_cents,active)
select v.id,v.shop_id,left(p.name || case when v.name='Regular' then '' else ' · '||v.name end,120),pr.price_cents,v.available
from public.product_variants v join public.products p on p.id=v.product_id
join lateral(select price_cents from public.product_prices where variant_id=v.id order by version desc limit 1) pr on true;
insert into public.pos_sales(id,shop_id,created_by,created_at,total_cents,method,tendered_cents,status,payment_status,items,refund_reason)
select o.id,o.shop_id,o.created_by,o.created_at,o.total_cents,coalesce(p.method,'unknown'),p.tendered_cents,o.status,coalesce(p.status,'unknown'),
coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name||' · '||i.variant_name,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents,'line_total_cents',i.line_total_cents)) from public.order_items i where i.order_id=o.id),'[]'),
(select reason from public.order_events where order_id=o.id and kind in ('refund','cancel') limit 1)
from public.orders o left join lateral(select * from public.payments where order_id=o.id order by created_at limit 1) p on true;

create function public.pos_save_product(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_products; product_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if length(trim(p_data->>'name')) not between 1 and 120 or (p_data->>'price_cents')::numeric<>trunc((p_data->>'price_cents')::numeric) then raise exception 'Invalid product';end if;
 insert into public.pos_products(id,shop_id,name,price_cents,active) values(product_id,p_shop_id,trim(p_data->>'name'),(p_data->>'price_cents')::bigint,(p_data->>'active')::boolean)
 on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,active=excluded.active where pos_products.shop_id=p_shop_id returning * into result;
 if result.id is null then raise exception 'Product belongs to another shop';end if;
 return to_jsonb(result);
end $$;
create function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sale_id uuid:=(p_data->>'id')::uuid; existing public.pos_sales; line jsonb;product public.pos_products; qty integer;total bigint:=0; snapshots jsonb:='[]';seen uuid[]:='{}';method text:=p_data->>'method';tendered bigint;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sale_id::text,0));
 select * into existing from public.pos_sales where id=sale_id;
 if found then
  if existing.shop_id<>p_shop_id or existing.created_by<>auth.uid() or existing.request is distinct from p_data then raise exception 'Sale ID already used for a different sale';end if;
  return jsonb_build_object('id',existing.id,'total_cents',existing.total_cents);
 end if;
 if method not in ('cash','gcash') or method is null or jsonb_typeof(p_data->'items') is distinct from 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Invalid sale';end if;
 for line in select * from jsonb_array_elements(p_data->'items') loop
  if (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) then raise exception 'Invalid quantity';end if;
  qty:=(line->>'quantity')::integer;if qty is null or qty not between 1 and 100 then raise exception 'Invalid quantity';end if;
  select * into product from public.pos_products where id=(line->>'product_id')::uuid and shop_id=p_shop_id and active for share;
  if not found then raise exception 'Product is no longer available. Refresh the menu.';end if;
  if product.id=any(seen) then raise exception 'Duplicate product';end if;seen:=array_append(seen,product.id);
  if (line->>'price_cents')::numeric is distinct from product.price_cents::numeric then raise exception 'A price changed. Refresh the menu and review this sale.';end if;
  total:=total+product.price_cents*qty;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('name',product.name,'quantity',qty,'unit_price_cents',product.price_cents,'line_total_cents',product.price_cents*qty));
 end loop;
 if method='cash' then if p_data->>'tendered_cents' is not null and (p_data->>'tendered_cents')::numeric<>trunc((p_data->>'tendered_cents')::numeric) then raise exception 'Invalid cash amount';end if;tendered:=coalesce((p_data->>'tendered_cents')::bigint,total);if tendered<total or tendered>100000000000 then raise exception 'Cash received must cover the total';end if;end if;
 insert into public.pos_sales(id,shop_id,created_by,total_cents,method,tendered_cents,items,request) values(sale_id,p_shop_id,auth.uid(),total,method,tendered,snapshots,p_data);
 return jsonb_build_object('id',sale_id,'total_cents',total);
end $$;
create function public.pos_refund(p_shop_id uuid,p_sale_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Enter a refund reason';end if;
 update public.pos_sales set status='refunded',payment_status='refunded',refund_reason=trim(p_reason),refunded_by=auth.uid(),refunded_at=now() where id=p_sale_id and shop_id=p_shop_id and status='completed';
 if not found and not exists(select 1 from public.pos_sales where id=p_sale_id and shop_id=p_shop_id and status='refunded') then raise exception 'Sale cannot be refunded';end if;
end $$;
create function public.pos_sales(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select timezone into zone from public.shops where id=p_shop_id;
 return coalesce((select jsonb_agg(to_jsonb(s)-'request' order by created_at desc) from public.pos_sales s where shop_id=p_shop_id and created_at>=p_from::timestamp at time zone zone and created_at<(p_to+1)::timestamp at time zone zone),'[]');
end $$;
revoke all on function public.pos_save_product(uuid,jsonb),public.pos_checkout(uuid,jsonb),public.pos_refund(uuid,uuid,text),public.pos_sales(uuid,date,date) from public,anon;
grant execute on function public.pos_save_product(uuid,jsonb),public.pos_checkout(uuid,jsonb),public.pos_refund(uuid,uuid,text),public.pos_sales(uuid,date,date) to authenticated;

commit;
