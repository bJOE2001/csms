begin;
alter table public.pos_sales add constraint pos_sales_shop_identity unique(shop_id,id);
create table public.pos_sale_consumptions (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null, sale_id uuid not null,
 line_key text not null, product_id uuid not null, size_id uuid, recipe_id uuid not null,
 ingredient_id uuid not null, ingredient_name text not null, base_unit public.ingredient_unit not null,
 mode text not null check(mode in ('recipe','finished_good')), quantity numeric(18,6) not null check(quantity>0),
 unit_cost_cents numeric(30,12) not null check(unit_cost_cents>=0), cost_cents bigint not null check(cost_cents>=0),
 created_at timestamptz not null default now(), unique(shop_id,sale_id,line_key,ingredient_id), unique(shop_id,id),
 foreign key(shop_id,sale_id) references public.pos_sales(shop_id,id), foreign key(shop_id,ingredient_id) references public.ingredients(shop_id,id),
 foreign key(shop_id,recipe_id) references public.pos_recipe_versions(shop_id,id)
);
create table public.pos_inventory_returns (
 id uuid primary key, shop_id uuid not null, consumption_id uuid not null, quantity numeric(18,6) not null check(quantity>0),
 cost_cents bigint not null check(cost_cents>=0), reason text not null check(length(trim(reason)) between 1 and 500),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(shop_id,consumption_id) references public.pos_sale_consumptions(shop_id,id)
);
create index pos_consumptions_shop_sale on public.pos_sale_consumptions(shop_id,sale_id);
create index pos_returns_shop_time on public.pos_inventory_returns(shop_id,created_at);
create trigger immutable_consumptions before update or delete on public.pos_sale_consumptions for each row execute function public.reject_history_change();
create trigger immutable_inventory_returns before update or delete on public.pos_inventory_returns for each row execute function public.reject_history_change();
alter table public.pos_sale_consumptions enable row level security;
alter table public.pos_inventory_returns enable row level security;
create policy pos_consumptions_owner on public.pos_sale_consumptions for select to authenticated using(public.is_shop_founder(shop_id));
create policy pos_returns_owner on public.pos_inventory_returns for select to authenticated using(public.is_shop_founder(shop_id));
revoke all on public.pos_sale_consumptions,public.pos_inventory_returns from public,anon,authenticated;
grant select on public.pos_sale_consumptions,public.pos_inventory_returns to authenticated;

-- Retain the existing validation/payment implementation behind a non-callable
-- core. The public RPC owns the additional inventory transaction boundary.
alter function public.pos_checkout(uuid,jsonb) rename to pos_checkout_core;
revoke all on function public.pos_checkout_core(uuid,jsonb) from public,anon,authenticated;
create function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; existing public.pos_sales; sale_id uuid:=(p_data->>'id')::uuid; line jsonb; recipe public.pos_recipe_versions; component jsonb;
 demand jsonb:='[]'; consumed jsonb:='[]'; snapshots jsonb:='[]'; requirement record; item public.ingredients; balance public.inventory_balances;
 key text; consumed_cost bigint; line_cost bigint; total_cost bigint:=0;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sale_id::text,0));
 select * into existing from public.pos_sales where id=sale_id;
 if found then return public.pos_checkout_core(p_shop_id,p_data);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 result:=public.pos_checkout_core(p_shop_id,p_data);
 select * into strict existing from public.pos_sales where id=sale_id;
 for line in select value from jsonb_array_elements(existing.items) loop
  select r.* into recipe from public.pos_inventory_configs c join public.pos_recipe_versions r on r.id=c.active_recipe_id
  where c.shop_id=p_shop_id and c.product_id=(line->>'product_id')::uuid and c.size_key=coalesce(line->>'size_id','');
  if not found then continue;end if;
  key:=(line->>'product_id')||':'||coalesce(line->>'size_id','');
  for component in select value from jsonb_array_elements(recipe.components) loop
   demand:=demand||jsonb_build_array(jsonb_build_object('line_key',key,'product_id',recipe.product_id,'size_id',recipe.size_id,'recipe_id',recipe.id,'mode',recipe.mode,
    'ingredient_id',component->>'ingredient_id','quantity',(component->>'quantity')::numeric*(line->>'quantity')::integer));
  end loop;
 end loop;
 if jsonb_array_length(demand)=0 then return result;end if;
 -- A stable item lock order plus the existing shop lock prevents overselling and
 -- serializes receiving, counts, recipe changes and concurrent checkouts.
 for requirement in select (d->>'ingredient_id')::uuid item_id,sum((d->>'quantity')::numeric) qty from jsonb_array_elements(demand) d group by 1 order by 1 loop
  select * into strict item from public.ingredients where shop_id=p_shop_id and id=requirement.item_id for update;
  select * into balance from public.inventory_balances where shop_id=p_shop_id and ingredient_id=item.id for update;
  if not item.active or balance.quantity is null or balance.quantity<requirement.qty then raise exception 'Insufficient stock for %. Refresh the menu or receive stock.',item.name;end if;
  if balance.value_cents is null then raise exception 'Inventory cost is missing for %.',item.name;end if;
  consumed_cost:=public.pos_inventory_move(p_shop_id,item.id,-requirement.qty,null,'sale',sale_id,'Completed POS sale');
  -- Allocate the actual ledger cents deterministically, preserving sub-cent
  -- weighted-average precision and reconciling every component to stock value.
  with raw as (select d,ordinality pos,(d->>'quantity')::numeric*balance.value_cents/balance.quantity amount from jsonb_array_elements(demand) with ordinality a(d,ordinality) where (d->>'ingredient_id')::uuid=item.id),
  ranked as (select *,floor(amount) whole,sum(floor(amount)) over() total_floor,row_number() over(order by amount-floor(amount) desc,pos) rank from raw)
  select consumed||jsonb_agg(d||jsonb_build_object('ingredient_name',item.name,'base_unit',item.base_unit,'unit_cost_cents',balance.value_cents/balance.quantity,
   'cost_cents',whole+case when rank<=consumed_cost-total_floor then 1 else 0 end) order by pos) into consumed from ranked;
 end loop;
 insert into public.pos_sale_consumptions(shop_id,sale_id,line_key,product_id,size_id,recipe_id,ingredient_id,ingredient_name,base_unit,mode,quantity,unit_cost_cents,cost_cents)
 select p_shop_id,sale_id,d->>'line_key',(d->>'product_id')::uuid,(d->>'size_id')::uuid,(d->>'recipe_id')::uuid,(d->>'ingredient_id')::uuid,d->>'ingredient_name',(d->>'base_unit')::public.ingredient_unit,d->>'mode',(d->>'quantity')::numeric,(d->>'unit_cost_cents')::numeric,(d->>'cost_cents')::bigint from jsonb_array_elements(consumed) d;
 for line in select value from jsonb_array_elements(existing.items) loop
  key:=(line->>'product_id')||':'||coalesce(line->>'size_id','');
  select sum((d->>'cost_cents')::bigint) into line_cost from jsonb_array_elements(consumed) d where d->>'line_key'=key;
  if line_cost>100000000::bigint*(line->>'quantity')::integer then raise exception 'Preparation cost exceeds the supported limit. Review inventory costs before checkout.';end if;
  if line_cost is not null then line:=line||jsonb_build_object('line_cost_cents',line_cost,'unit_cost_cents',round(line_cost::numeric/(line->>'quantity')::integer,6),'inventory_tracked',true);
  else line_cost:=(line->>'unit_cost_cents')::bigint*(line->>'quantity')::integer;end if;
  total_cost:=total_cost+line_cost; snapshots:=snapshots||jsonb_build_array(line);
 end loop;
 update public.pos_sales set items=snapshots,total_cost_cents=total_cost where id=sale_id;
 return result;
end $$;

create function public.pos_inventory_return(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; entry public.pos_sale_consumptions; qty numeric:=(p_data->>'quantity')::numeric;
 reason text:=trim(p_data->>'reason'); returned numeric; returned_cost bigint; value bigint; replay jsonb;
begin
 perform public.require_business_access(p_shop_id);
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.return',p_data);if replay is not null then return replay;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 select * into entry from public.pos_sale_consumptions where shop_id=p_shop_id and id=(p_data->>'consumption_id')::uuid for update;
 if not found or entry.mode<>'finished_good' then raise exception 'Only recorded finished goods can be returned to stock';end if;
 perform 1 from public.pos_sales where id=entry.sale_id and status='refunded' for update;
 if not found then raise exception 'Record the full payment refund before returning reusable finished goods';end if;
 select coalesce(sum(quantity),0),coalesce(sum(cost_cents),0) into returned,returned_cost from public.pos_inventory_returns where consumption_id=entry.id;
 if qty is null or qty<=0 or qty<>round(qty,6) or qty>entry.quantity-returned or (entry.base_unit='each' and qty<>trunc(qty)) or reason is null or length(reason) not between 1 and 500 then raise exception 'Check the remaining return quantity and reason';end if;
 value:=case when qty=entry.quantity-returned then entry.cost_cents-returned_cost else floor((entry.cost_cents-returned_cost)*qty/(entry.quantity-returned))::bigint end;
 perform public.pos_inventory_move(p_shop_id,entry.ingredient_id,qty,value,'return',op,reason);
 insert into public.pos_inventory_returns(id,shop_id,consumption_id,quantity,cost_cents,reason,created_by) values(op,p_shop_id,entry.id,qty,value,reason,auth.uid());
 perform public.record_business_audit(p_shop_id,'inventory.return','pos_sale',entry.sale_id,p_data);
 return public.finish_business_operation(p_shop_id,op,jsonb_build_object('id',op));
end $$;
create function public.pos_inventory_cost_credits(p_shop_id uuid,p_from date,p_to date) returns bigint language plpgsql stable security definer set search_path='' as $$
declare value bigint; zone text;
begin
 if not public.is_shop_member(p_shop_id) then raise exception 'Shop access required';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select timezone into strict zone from public.shops where id=p_shop_id;
 select coalesce(sum(cost_cents),0)::bigint into value from public.pos_inventory_returns where shop_id=p_shop_id and created_at>=(p_from::timestamp at time zone zone) and created_at<((p_to+1)::timestamp at time zone zone);
 return value;
end $$;
alter function public.pos_inventory_read(uuid,date,date) rename to pos_inventory_read_recipes;
revoke all on function public.pos_inventory_read_recipes(uuid,date,date) from public,anon,authenticated;
create function public.pos_inventory_read(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=public.pos_inventory_read_recipes(p_shop_id,p_from,p_to);
 return result||jsonb_build_object('returnable',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('remaining_quantity',(c.quantity-coalesce(r.quantity,0))::text,'receipt',upper(left(c.sale_id::text,8)))) from public.pos_sale_consumptions c join public.pos_sales s on s.id=c.sale_id left join lateral(select sum(quantity) quantity from public.pos_inventory_returns where consumption_id=c.id) r on true where c.shop_id=p_shop_id and c.mode='finished_good' and s.status='refunded' and c.quantity>coalesce(r.quantity,0)),'[]'));
end $$;
revoke all on function public.pos_checkout(uuid,jsonb),public.pos_inventory_return(uuid,jsonb),public.pos_inventory_cost_credits(uuid,date,date),public.pos_inventory_read(uuid,date,date) from public,anon;
grant execute on function public.pos_checkout(uuid,jsonb),public.pos_inventory_return(uuid,jsonb),public.pos_inventory_cost_credits(uuid,date,date),public.pos_inventory_read(uuid,date,date) to authenticated;
commit;
