begin;
-- A one-time, audited supplement; receipt prices and items remain unchanged.
alter table public.pos_sales
 add column cost_recorded_at timestamptz,
 add column cost_recorded_by uuid references auth.users(id),
 add column cost_note text check(length(trim(cost_note)) between 1 and 500);

create function public.pos_record_cost(p_shop_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare sale public.pos_sales; cost numeric:=(p_data->>'cost_cents')::numeric; note text:=trim(p_data->>'note');
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if cost is null or cost<>trunc(cost) or cost not between 0 and 1000000000000 then raise exception 'Enter a valid total preparation cost';end if;
 if note is null or length(note) not between 1 and 500 then raise exception 'Explain the source of this cost';end if;
 select * into sale from public.pos_sales where id=(p_data->>'id')::uuid and shop_id=p_shop_id for update;
 if not found then raise exception 'Sale not found';end if;
 if sale.status not in ('completed','refunded') then raise exception 'Cancelled sales do not need a cost';end if;
 if sale.total_cost_cents is not null then
  -- Retrying an identical manual entry is safe, but a saved cost cannot be overwritten.
  if sale.cost_recorded_at is not null and sale.cost_recorded_by=auth.uid() and sale.total_cost_cents=cost and sale.cost_note=note then return;end if;
  raise exception 'This sale already has a saved cost. Refresh the report';
 end if;
 update public.pos_sales set total_cost_cents=cost::bigint,cost_recorded_at=now(),cost_recorded_by=auth.uid(),cost_note=note where id=sale.id;
end $$;
revoke all on function public.pos_record_cost(uuid,jsonb) from public,anon;
grant execute on function public.pos_record_cost(uuid,jsonb) to authenticated;
commit;
