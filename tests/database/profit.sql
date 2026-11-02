select set_config('test.shop',(select id::text from public.shops where name='Test shop'),false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$declare shop uuid:=current_setting('test.shop')::uuid;
payload jsonb:='{"id":"00000000-0000-4000-8000-000000000010","method":"gcash","items":[{"product_id":"00000000-0000-4000-8000-000000000003","quantity":2,"price_cents":15000}]}';
expense jsonb:=jsonb_build_object('id','00000000-0000-4000-8000-000000000011','spent_on',current_date,'description','Electricity','amount_cents',2500);
begin
 -- Historical receipts remain explicitly unknown; setting today's cost cannot backfill them.
 assert (select total_cost_cents from public.pos_sales where id='00000000-0000-4000-8000-000000000004') is null;
 perform public.pos_save_product(shop,'{"id":"00000000-0000-4000-8000-000000000003","name":"Latte","price_cents":15000,"cost_cents":5000,"active":true}');
 perform public.pos_checkout(shop,payload);
 assert (select total_cost_cents from public.pos_sales where id=(payload->>'id')::uuid)=10000;
 assert (select items->0->>'unit_cost_cents' from public.pos_sales where id=(payload->>'id')::uuid)='5000';
 perform public.pos_save_product(shop,'{"id":"00000000-0000-4000-8000-000000000003","name":"Latte","price_cents":15000,"cost_cents":6000,"active":true}');
 -- Old clients can still edit without silently clearing the recorded cost.
 perform public.pos_save_product(shop,'{"id":"00000000-0000-4000-8000-000000000003","name":"Latte","price_cents":15000,"active":true}');
 assert (select cost_cents from public.pos_products where id='00000000-0000-4000-8000-000000000003')=6000;
 perform public.pos_checkout(shop,payload);
 assert (select total_cost_cents from public.pos_sales where id=(payload->>'id')::uuid)=10000;
 perform public.pos_refund(shop,(payload->>'id')::uuid,'Prepared drink returned');
 assert (select total_cost_cents from public.pos_sales where id=(payload->>'id')::uuid)=10000;
 perform public.pos_add_expense(shop,expense);
 perform public.pos_add_expense(shop,expense);
 assert jsonb_array_length(public.pos_expenses(shop,current_date,current_date))=1;
 assert jsonb_array_length(public.pos_expenses(shop,current_date-2,current_date-1))=0;
 begin perform public.pos_add_expense(shop,jsonb_set(expense,'{amount_cents}','999'));raise exception 'Changed expense replay accepted';exception when raise_exception then if sqlerrm='Changed expense replay accepted' then raise;end if;end;
 perform public.pos_void_expense(shop,(expense->>'id')::uuid);
 perform public.pos_void_expense(shop,(expense->>'id')::uuid);
 assert (public.pos_expenses(shop,current_date,current_date)->0->>'voided')::boolean;
 begin perform public.pos_save_product(shop,'{"name":"Bad","price_cents":10,"cost_cents":1.5,"active":true}');raise exception 'Fractional cost accepted';exception when raise_exception then if sqlerrm='Fractional cost accepted' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin
 assert (select count(*) from public.pos_expenses)=0;
 begin perform public.pos_expenses(current_setting('test.shop')::uuid,current_date,current_date);raise exception 'Cross shop expense read accepted';exception when raise_exception then if sqlerrm='Cross shop expense read accepted' then raise;end if;end;
 begin perform public.pos_void_expense(current_setting('test.shop')::uuid,'00000000-0000-4000-8000-000000000011');raise exception 'Cross shop expense void accepted';exception when raise_exception then if sqlerrm='Cross shop expense void accepted' then raise;end if;end;
 begin perform public.pos_add_expense(current_setting('test.shop')::uuid,'{}');raise exception 'Cross shop expense write accepted';exception when raise_exception then if sqlerrm='Cross shop expense write accepted' then raise;end if;end;
 begin insert into public.pos_expenses(id,shop_id,created_by,spent_on,description,amount_cents) values(gen_random_uuid(),current_setting('test.shop')::uuid,auth.uid(),current_date,'Bad',1);raise exception 'Direct write accepted';exception when insufficient_privilege then null;end;
end $$;
