begin;
-- Expand the existing POS catalog. Existing product IDs, prices and receipts stay intact.
create table public.pos_categories (
 id uuid primary key default gen_random_uuid(),
 shop_id uuid not null references public.shops(id),
 name text not null check(length(trim(name)) between 1 and 60)
);
create unique index pos_categories_shop_name on public.pos_categories(shop_id,lower(trim(name)));
alter table public.pos_categories enable row level security;
create policy pos_categories_read on public.pos_categories for select to authenticated using(public.is_shop_member(shop_id));
revoke all on public.pos_categories from public,anon,authenticated;
grant select on public.pos_categories to authenticated;

create function public.pos_valid_sizes(p_sizes jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare size jsonb; ids uuid[]:='{}'; labels text[]:='{}'; size_id uuid; label text; defaults integer:=0;
begin
 if jsonb_typeof(p_sizes) is distinct from 'array' or jsonb_array_length(p_sizes)>20 then return false;end if;
 for size in select * from jsonb_array_elements(p_sizes) loop
  if jsonb_typeof(size) is distinct from 'object' or jsonb_typeof(size->'id') is distinct from 'string' or jsonb_typeof(size->'label') is distinct from 'string' then return false;end if;
  size_id:=(size->>'id')::uuid;label:=lower(trim(size->>'label'));
  if size_id is null or size_id=any(ids) or label is null or length(label) not between 1 and 60 or label=any(labels) then return false;end if;
  if jsonb_typeof(size->'price_cents') is distinct from 'number' or (size->>'price_cents')::numeric<>trunc((size->>'price_cents')::numeric) or (size->>'price_cents')::numeric not between 0 and 100000000 then return false;end if;
  if not(size ? 'cost_cents') or (size->'cost_cents'<>'null'::jsonb and (jsonb_typeof(size->'cost_cents') is distinct from 'number' or (size->>'cost_cents')::numeric<>trunc((size->>'cost_cents')::numeric) or (size->>'cost_cents')::numeric not between 0 and 100000000)) then return false;end if;
  if jsonb_typeof(size->'active') is distinct from 'boolean' or jsonb_typeof(size->'is_default') is distinct from 'boolean' then return false;end if;
  if (size->>'is_default')::boolean then defaults:=defaults+1;end if;
  ids:=array_append(ids,size_id);labels:=array_append(labels,label);
 end loop;
 return jsonb_array_length(p_sizes)=0 or defaults=1;
exception when others then return false;
end $$;

alter table public.pos_products
 add column category_id uuid references public.pos_categories(id) on delete set null,
 add column description text not null default '' check(length(description)<=1000),
 add column image_url text check(length(image_url)<=2048 and (image_url ~ '^https://' or image_url ~ '^/[^/]')),
 add column sizes jsonb not null default '[]' check(public.pos_valid_sizes(sizes)),
 add column archived_at timestamptz;
create index pos_products_category on public.pos_products(category_id);

create function public.pos_save_category(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_categories; category_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid()); label text:=trim(p_data->>'name');
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if label is null or length(label) not between 1 and 60 then raise exception 'Enter a category name of up to 60 characters';end if;
 insert into public.pos_categories(id,shop_id,name) values(category_id,p_shop_id,label)
 on conflict(id) do update set name=excluded.name where pos_categories.shop_id=p_shop_id returning * into result;
 if result.id is null then raise exception 'Category belongs to another shop';end if;
 return to_jsonb(result);
exception when unique_violation then raise exception 'A category with this name already exists';
end $$;
create function public.pos_delete_category(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 perform 1 from public.pos_categories where id=p_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Category not found';end if;
 if exists(select 1 from public.pos_products where category_id=p_id and archived_at is null) then raise exception 'Reassign products in this category before deleting it';end if;
 delete from public.pos_categories where id=p_id and shop_id=p_shop_id;
end $$;
create function public.pos_archive_product(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 update public.pos_products set active=false,archived_at=coalesce(archived_at,now()) where id=p_id and shop_id=p_shop_id;
 if not found then raise exception 'Product not found';end if;
end $$;

create or replace function public.pos_save_product(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_products; previous public.pos_products; product_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 category uuid; configured jsonb; default_size jsonb; base_price bigint; base_cost bigint;
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if p_data->>'name' is null or length(trim(p_data->>'name')) not between 1 and 120 or jsonb_typeof(p_data->'active') is distinct from 'boolean' or jsonb_typeof(p_data->'price_cents') is distinct from 'number' or (p_data->>'price_cents')::numeric<>trunc((p_data->>'price_cents')::numeric) or (p_data->>'price_cents')::numeric not between 0 and 100000000 then raise exception 'Invalid product name or price';end if;
 if p_data->>'cost_cents' is not null and (jsonb_typeof(p_data->'cost_cents') is distinct from 'number' or (p_data->>'cost_cents')::numeric<>trunc((p_data->>'cost_cents')::numeric) or (p_data->>'cost_cents')::numeric not between 0 and 100000000) then raise exception 'Invalid product cost';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(product_id::text,0));
 select * into previous from public.pos_products where id=product_id for update;
 if found and (previous.shop_id<>p_shop_id or previous.archived_at is not null) then raise exception 'Product cannot be edited';end if;
 category:=case when p_data ? 'category_id' then (p_data->>'category_id')::uuid else previous.category_id end;
 if category is not null then
  perform 1 from public.pos_categories where id=category and shop_id=p_shop_id for share;
  if not found then raise exception 'Choose a category from this shop';end if;
 end if;
 configured:=case when p_data ? 'sizes' then p_data->'sizes' else coalesce(previous.sizes,'[]') end;
 if not public.pos_valid_sizes(configured) then raise exception 'Check size labels, prices and default size';end if;
 -- Trim labels once, so selection snapshots and duplicate checks use the same labels.
 select coalesce(jsonb_agg(value || jsonb_build_object('label',trim(value->>'label'))),'[]') into configured from jsonb_array_elements(configured);
 base_price:=(p_data->>'price_cents')::bigint;
 base_cost:=case when p_data ? 'cost_cents' then (p_data->>'cost_cents')::bigint else previous.cost_cents end;
 if jsonb_array_length(configured)>0 then
  select value into default_size from jsonb_array_elements(configured) where (value->>'is_default')::boolean;
  if not(p_data ? 'sizes') and (base_price is distinct from previous.price_cents or base_cost is distinct from previous.cost_cents) then raise exception 'Use Menu Management to change size prices and costs';end if;
  base_price:=(default_size->>'price_cents')::bigint;base_cost:=(default_size->>'cost_cents')::bigint;
 end if;
 insert into public.pos_products(id,shop_id,name,price_cents,cost_cents,active,category_id,description,image_url,sizes)
 values(product_id,p_shop_id,trim(p_data->>'name'),base_price,base_cost,(p_data->>'active')::boolean,category,
  case when p_data ? 'description' then trim(p_data->>'description') else coalesce(previous.description,'') end,
  case when p_data ? 'image_url' then p_data->>'image_url' else previous.image_url end,configured)
 on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,cost_cents=excluded.cost_cents,active=excluded.active,category_id=excluded.category_id,description=excluded.description,image_url=excluded.image_url,sizes=excluded.sizes
 returning * into result;
 return to_jsonb(result);
end $$;

create or replace function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sale_id uuid:=(p_data->>'id')::uuid; existing public.pos_sales; line jsonb; product public.pos_products; selected jsonb; size_id uuid; size_label text;
 qty integer; total bigint:=0; costs bigint:=0; unit_price bigint; unit_cost bigint; snapshots jsonb:='[]'; seen text[]:='{}'; item_key text; method text:=p_data->>'method';tendered bigint;
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
  if jsonb_typeof(line->'quantity') is distinct from 'number' or (line->>'quantity')::numeric<>trunc((line->>'quantity')::numeric) then raise exception 'Invalid quantity';end if;
  qty:=(line->>'quantity')::integer;if qty is null or qty not between 1 and 100 then raise exception 'Invalid quantity';end if;
  select * into product from public.pos_products where id=(line->>'product_id')::uuid and shop_id=p_shop_id and active and archived_at is null for share;
  if not found then raise exception 'Product is no longer available. Refresh the menu.';end if;
  size_id:=(line->>'size_id')::uuid;size_label:=null;
  if jsonb_array_length(product.sizes)>0 then
   select value into selected from jsonb_array_elements(product.sizes) where (value->>'id')::uuid=size_id and (value->>'active')::boolean;
   if not found then raise exception 'This size is no longer available. Review the menu.';end if;
   unit_price:=(selected->>'price_cents')::bigint;unit_cost:=(selected->>'cost_cents')::bigint;size_label:=selected->>'label';
  else
   if size_id is not null then raise exception 'This size was removed. Review the menu.';end if;
   unit_price:=product.price_cents;unit_cost:=product.cost_cents;
  end if;
  if line ? 'size_label' and line->>'size_label' is distinct from size_label then raise exception 'A size label changed. Refresh the menu and review this sale.';end if;
  item_key:=product.id::text||':'||coalesce(size_id::text,'');
  if item_key=any(seen) then raise exception 'Duplicate product and size';end if;seen:=array_append(seen,item_key);
  if jsonb_typeof(line->'price_cents') is distinct from 'number' or (line->>'price_cents')::numeric is distinct from unit_price::numeric then raise exception 'A price changed. Refresh the menu and review this sale.';end if;
  total:=total+unit_price*qty;costs:=costs+unit_cost*qty;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'size_id',size_id,'size_label',size_label,'quantity',qty,'unit_cost_cents',unit_cost,'unit_price_cents',unit_price,'line_total_cents',unit_price*qty));
 end loop;
 if method='cash' then
  if p_data->>'tendered_cents' is not null and (p_data->>'tendered_cents')::numeric<>trunc((p_data->>'tendered_cents')::numeric) then raise exception 'Invalid cash amount';end if;
  tendered:=coalesce((p_data->>'tendered_cents')::bigint,total);
  if tendered<total or tendered>100000000000 then raise exception 'Cash received must cover the total';end if;
 end if;
 insert into public.pos_sales(id,shop_id,created_by,total_cents,method,tendered_cents,items,request,total_cost_cents)
 values(sale_id,p_shop_id,auth.uid(),total,method,tendered,snapshots,p_data,costs);
 return jsonb_build_object('id',sale_id,'total_cents',total);
end $$;

revoke all on function public.pos_save_category(uuid,jsonb),public.pos_delete_category(uuid,uuid),public.pos_archive_product(uuid,uuid) from public,anon;
grant execute on function public.pos_save_category(uuid,jsonb),public.pos_delete_category(uuid,uuid),public.pos_archive_product(uuid,uuid) to authenticated;
-- Existing grants on replaced checkout/save functions remain unchanged.
commit;
