begin;
-- Add edit support without replacing expense records or changing existing readers/writers.
create function public.pos_update_expense(p_shop_id uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  before_entry public.pos_expenses;
  after_entry public.pos_expenses;
  operation_id uuid;
  replay jsonb;
  v_amount numeric;
  v_description text;
  v_spent_on date;
begin
  perform public.require_business_access(p_shop_id);
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Invalid expense';
  end if;
  v_amount := (p_data->>'amount_cents')::numeric;
  v_description := trim(p_data->>'description');
  v_spent_on := (p_data->>'spent_on')::date;
  if v_amount is null or v_amount <> trunc(v_amount) or v_amount not between 1 and 100000000
    or v_description is null or length(v_description) not between 1 and 200 or v_spent_on is null then
    raise exception 'Check the expense date, description and amount';
  end if;
  operation_id := (p_data->>'operation_id')::uuid;
  replay := public.claim_business_operation(p_shop_id, operation_id, 'pos.expense.update', p_data);
  if replay is not null then return replay; end if;

  select * into before_entry from public.pos_expenses
    where id = (p_data->>'id')::uuid and shop_id = p_shop_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if before_entry.voided then raise exception 'A voided expense cannot be edited'; end if;
  if p_data->'expected' is distinct from jsonb_build_object(
    'spent_on', before_entry.spent_on, 'description', before_entry.description,
    'amount_cents', before_entry.amount_cents
  ) then
    raise exception 'This expense changed. Refresh Expenses and try again.';
  end if;

  update public.pos_expenses set spent_on = v_spent_on,
    description = v_description, amount_cents = v_amount::bigint
    where id = before_entry.id and shop_id = p_shop_id returning * into after_entry;
  perform public.record_business_audit(p_shop_id, 'pos.expense.updated', 'pos_expense', before_entry.id,
    jsonb_build_object('operation_id', operation_id, 'before', to_jsonb(before_entry), 'after', to_jsonb(after_entry)));
  return public.finish_business_operation(p_shop_id, operation_id, to_jsonb(after_entry));
end $$;
revoke all on function public.pos_update_expense(uuid, jsonb) from public, anon;
grant execute on function public.pos_update_expense(uuid, jsonb) to authenticated;
commit;
