begin;
-- Additive upgrade: unknown historical costs remain NULL, never fabricated as zero.
alter table public.pos_products add column cost_cents bigint check(cost_cents between 0 and 100000000);
alter table public.pos_sales add column total_cost_cents bigint check(total_cost_cents between 0 and 9007199254740991);
create table public.pos_expenses (
 id uuid primary key, shop_id uuid not null references public.shops(id),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 spent_on date not null, description text not null check(length(trim(description)) between 1 and 200),
 amount_cents bigint not null check(amount_cents between 1 and 100000000), voided boolean not null default false
);
create index pos_expenses_shop_date on public.pos_expenses(shop_id,spent_on);
alter table public.pos_expenses enable row level security;
create policy pos_expenses_read on public.pos_expenses for select to authenticated using(public.is_shop_member(shop_id));
revoke all on public.pos_expenses from public,anon,authenticated;
grant select on public.pos_expenses to authenticated;
create or replace function public.pos_save_product(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_products; product_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if length(trim(p_data->>'name')) not between 1 and 120 or (p_data->>'price_cents')::numeric<>trunc((p_data->>'price_cents')::numeric) then raise exception 'Invalid product';end if;
 if p_data->>'cost_cents' is not null and ((p_data->>'cost_cents')::numeric<>trunc((p_data->>'cost_cents')::numeric) or (p_data->>'cost_cents')::numeric not between 0 and 100000000) then raise exception 'Invalid product cost';end if;
 insert into public.pos_products(id,shop_id,name,price_cents,active,cost_cents) values(product_id,p_shop_id,trim(p_data->>'name'),(p_data->>'price_cents')::bigint,(p_data->>'active')::boolean,(p_data->>'cost_cents')::bigint)
 on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,active=excluded.active,cost_cents=case when p_data ? 'cost_cents' then excluded.cost_cents else pos_products.cost_cents end where pos_products.shop_id=p_shop_id returning * into result;
 if result.id is null then raise exception 'Product belongs to another shop';end if;
 return to_jsonb(result);
end $$;
create or replace function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sale_id uuid:=(p_data->>'id')::uuid; existing public.pos_sales; line jsonb;product public.pos_products; qty integer;total bigint:=0; snapshots jsonb:='[]';seen uuid[]:='{}';method text:=p_data->>'method';tendered bigint; costs bigint:=0;
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
  costs:=costs+product.cost_cents*qty;
  total:=total+product.price_cents*qty;
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('name',product.name,'quantity',qty,'unit_cost_cents',product.cost_cents,'unit_price_cents',product.price_cents,'line_total_cents',product.price_cents*qty));
 end loop;
 if method='cash' then if p_data->>'tendered_cents' is not null and (p_data->>'tendered_cents')::numeric<>trunc((p_data->>'tendered_cents')::numeric) then raise exception 'Invalid cash amount';end if;tendered:=coalesce((p_data->>'tendered_cents')::bigint,total);if tendered<total or tendered>100000000000 then raise exception 'Cash received must cover the total';end if;end if;
 insert into public.pos_sales(id,shop_id,created_by,total_cents,method,tendered_cents,items,request,total_cost_cents) values(sale_id,p_shop_id,auth.uid(),total,method,tendered,snapshots,p_data,costs);
 return jsonb_build_object('id',sale_id,'total_cents',total);
end $$;

create function public.pos_add_expense(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_expenses; expense_id uuid:=(p_data->>'id')::uuid;
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if (p_data->>'amount_cents')::numeric<>trunc((p_data->>'amount_cents')::numeric) then raise exception 'Invalid expense amount';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(expense_id::text,0));
 select * into result from public.pos_expenses where id=expense_id;
 if found then
  if result.shop_id<>p_shop_id or result.created_by<>auth.uid() or result.spent_on is distinct from (p_data->>'spent_on')::date or result.description is distinct from trim(p_data->>'description') or result.amount_cents is distinct from (p_data->>'amount_cents')::bigint then raise exception 'Expense ID already used for a different expense';end if;
  return to_jsonb(result);
 end if;
 insert into public.pos_expenses(id,shop_id,created_by,spent_on,description,amount_cents)
 values(expense_id,p_shop_id,auth.uid(),(p_data->>'spent_on')::date,trim(p_data->>'description'),(p_data->>'amount_cents')::bigint) returning * into result;
 return to_jsonb(result);
end $$;
create function public.pos_void_expense(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 update public.pos_expenses set voided=true where id=p_id and shop_id=p_shop_id;
 if not found then raise exception 'Expense not found';end if;
end $$;
create function public.pos_expenses(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 return coalesce((select jsonb_agg(to_jsonb(e) order by spent_on desc,created_at desc) from public.pos_expenses e where shop_id=p_shop_id and spent_on between p_from and p_to),'[]');
end $$;
revoke all on function public.pos_add_expense(uuid,jsonb),public.pos_void_expense(uuid,uuid),public.pos_expenses(uuid,date,date) from public,anon;
grant execute on function public.pos_add_expense(uuid,jsonb),public.pos_void_expense(uuid,uuid),public.pos_expenses(uuid,date,date) to authenticated;
commit;
