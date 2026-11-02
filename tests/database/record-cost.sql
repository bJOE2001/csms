select set_config('test.shop',(select id::text from public.shops where name='Test shop'),false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin
 begin perform public.pos_record_cost(current_setting('test.shop')::uuid,'{"id":"00000000-0000-4000-8000-000000000004","cost_cents":3500,"note":"Ingredient record"}');raise exception 'Unauthorized cost write accepted';exception when raise_exception then if sqlerrm='Unauthorized cost write accepted' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$declare shop uuid:=current_setting('test.shop')::uuid;
payload jsonb:='{"id":"00000000-0000-4000-8000-000000000004","cost_cents":3500,"note":"Ingredient record"}';original_items jsonb; original_total bigint; recorded_at timestamptz;
begin
 select items,total_cents into original_items,original_total from public.pos_sales where id=(payload->>'id')::uuid;
 begin perform public.pos_record_cost(shop,jsonb_set(payload,'{cost_cents}','-1'));raise exception 'Negative cost accepted';exception when raise_exception then if sqlerrm='Negative cost accepted' then raise;end if;end;
 begin perform public.pos_record_cost(shop,jsonb_set(payload,'{cost_cents}','0.5'));raise exception 'Fractional cost accepted';exception when raise_exception then if sqlerrm='Fractional cost accepted' then raise;end if;end;
 begin perform public.pos_record_cost(shop,jsonb_set(payload,'{note}','" "'));raise exception 'Missing note accepted';exception when raise_exception then if sqlerrm='Missing note accepted' then raise;end if;end;
 perform public.pos_record_cost(shop,payload);
 select cost_recorded_at into recorded_at from public.pos_sales where id=(payload->>'id')::uuid;
 assert recorded_at is not null;
 perform public.pos_record_cost(shop,payload);
 assert (select total_cost_cents=3500 and cost_recorded_by=auth.uid() and cost_note='Ingredient record' and cost_recorded_at=recorded_at and items=original_items and total_cents=original_total and status='refunded' from public.pos_sales where id=(payload->>'id')::uuid);
 assert (select (s->>'total_cost_cents')::bigint from jsonb_array_elements(public.pos_sales(shop,current_date,current_date)) s where s->>'id'=payload->>'id')=3500;
 begin perform public.pos_record_cost(shop,jsonb_set(payload,'{cost_cents}','4000'));raise exception 'Overwrite accepted';exception when raise_exception then if sqlerrm='Overwrite accepted' then raise;end if;end;
 begin perform public.pos_record_cost(shop,jsonb_set(payload,'{id}','"00000000-0000-4000-8000-000000000010"'));raise exception 'Checkout snapshot overwritten';exception when raise_exception then if sqlerrm='Checkout snapshot overwritten' then raise;end if;end;
end $$;
