begin;
-- Existing classifications remain operating expenses until an owner explicitly
-- reclassifies them. Receiving stock never creates an expense automatically.
alter table public.pos_expenses add column classification text not null default 'operating_expense' check(classification in ('operating_expense','inventory_purchase'));
create or replace function public.pos_add_expense(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_expenses; expense_id uuid:=(p_data->>'id')::uuid; classification text:=coalesce(p_data->>'classification','operating_expense');
begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Owner access required';end if;
 if (p_data->>'amount_cents')::numeric<>trunc((p_data->>'amount_cents')::numeric) then raise exception 'Invalid expense amount';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(expense_id::text,0));
 select * into result from public.pos_expenses where id=expense_id;
 if found then
  if result.shop_id<>p_shop_id or result.created_by<>auth.uid() or result.spent_on is distinct from (p_data->>'spent_on')::date or result.description is distinct from trim(p_data->>'description') or result.amount_cents is distinct from (p_data->>'amount_cents')::bigint or (p_data ? 'classification' and result.classification is distinct from classification) then raise exception 'Expense ID already used for a different expense';end if;
  return to_jsonb(result);
 end if;
 insert into public.pos_expenses(id,shop_id,created_by,spent_on,description,amount_cents,classification)
 values(expense_id,p_shop_id,auth.uid(),(p_data->>'spent_on')::date,trim(p_data->>'description'),(p_data->>'amount_cents')::bigint,classification) returning * into result;
 perform public.record_business_audit(p_shop_id,'pos.expense.created','pos_expense',expense_id,to_jsonb(result));
 return to_jsonb(result);
end $$;
create or replace function public.pos_update_expense(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare before_entry public.pos_expenses; after_entry public.pos_expenses; operation_id uuid; replay jsonb; expected jsonb;
 v_amount numeric:=(p_data->>'amount_cents')::numeric; v_description text:=trim(p_data->>'description'); v_spent_on date:=(p_data->>'spent_on')::date;
begin
 perform public.require_business_access(p_shop_id);
 if v_amount is null or v_amount<>trunc(v_amount) or v_amount not between 1 and 100000000 or v_description is null or length(v_description) not between 1 and 200 or v_spent_on is null then raise exception 'Check the expense date, description and amount';end if;
 operation_id:=(p_data->>'operation_id')::uuid;
 replay:=public.claim_business_operation(p_shop_id,operation_id,'pos.expense.update',p_data);if replay is not null then return replay;end if;
 select * into before_entry from public.pos_expenses where id=(p_data->>'id')::uuid and shop_id=p_shop_id for update;
 if not found then raise exception 'Expense not found';end if;
 if before_entry.voided then raise exception 'A voided expense cannot be edited';end if;
 expected:=jsonb_build_object('spent_on',before_entry.spent_on,'description',before_entry.description,'amount_cents',before_entry.amount_cents);
 if (p_data->'expected') ? 'classification' then expected:=expected||jsonb_build_object('classification',before_entry.classification);end if;
 if p_data->'expected' is distinct from expected then raise exception 'This expense changed. Refresh Expenses and try again.';end if;
 update public.pos_expenses set spent_on=v_spent_on,description=v_description,amount_cents=v_amount::bigint,classification=coalesce(p_data->>'classification',before_entry.classification) where id=before_entry.id and shop_id=p_shop_id returning * into after_entry;
 perform public.record_business_audit(p_shop_id,'pos.expense.updated','pos_expense',before_entry.id,jsonb_build_object('operation_id',operation_id,'before',to_jsonb(before_entry),'after',to_jsonb(after_entry)));
 return public.finish_business_operation(p_shop_id,operation_id,to_jsonb(after_entry));
end $$;
-- The existing one-time missing-cost supplement remains available for mixed
-- receipts, but cannot understate their immutable inventory consumption.
create or replace function public.pos_record_cost(p_shop_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare sale public.pos_sales; cost numeric:=(p_data->>'cost_cents')::numeric; note text:=trim(p_data->>'note'); tracked_cost bigint;
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
 select coalesce(sum(cost_cents),0)::bigint into tracked_cost from public.pos_sale_consumptions where shop_id=p_shop_id and sale_id=sale.id;
 if cost<tracked_cost then raise exception 'Total preparation cost cannot be less than recorded inventory consumption. Include costs for every item on this receipt.';end if;
 update public.pos_sales set total_cost_cents=cost::bigint,cost_recorded_at=now(),cost_recorded_by=auth.uid(),cost_note=note where id=sale.id;
 perform public.record_business_audit(p_shop_id,'pos.sale.cost_recorded','pos_sale',sale.id,jsonb_build_object('cost_cents',cost,'tracked_cost_cents',tracked_cost,'note',note));
end $$;
commit;
