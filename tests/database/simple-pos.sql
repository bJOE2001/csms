insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','owner@test.invalid'),('00000000-0000-4000-8000-000000000002','other@test.invalid');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
select public.create_shop('Test shop','Asia/Manila') as shop \gset
select public.pos_save_product(:'shop','{"id":"00000000-0000-4000-8000-000000000003","name":"Latte","price_cents":14500,"active":true}');
select set_config('test.shop',:'shop',false);
do $$declare payload jsonb:='{"id":"00000000-0000-4000-8000-000000000004","method":"cash","tendered_cents":20000,"items":[{"product_id":"00000000-0000-4000-8000-000000000003","price_cents":14500,"quantity":1}]}';shop uuid:=current_setting('test.shop')::uuid;result jsonb;begin
 result:=public.pos_checkout(shop,payload);assert (result->>'total_cents')::int=14500;
 perform public.pos_checkout(shop,payload);assert (select count(*) from public.pos_sales)=1;
 begin perform public.pos_checkout(shop,jsonb_set(payload,'{items,0,quantity}','2'));raise exception 'Replay accepted';exception when raise_exception then if sqlerrm='Replay accepted' then raise;end if;end;
 begin perform public.pos_checkout(shop,jsonb_set(jsonb_set(payload,'{id}','"00000000-0000-4000-8000-000000000005"'),'{items,0,price_cents}','1'));raise exception 'Spoof accepted';exception when raise_exception then if sqlerrm='Spoof accepted' then raise;end if;end;
 begin perform public.pos_checkout(shop,jsonb_set(jsonb_set(payload,'{id}','"00000000-0000-4000-8000-000000000005"'),'{tendered_cents}','1'));raise exception 'Insufficient cash accepted';exception when raise_exception then if sqlerrm='Insufficient cash accepted' then raise;end if;end;
 assert jsonb_array_length(public.pos_sales(shop,current_date,current_date))=1;
 perform public.pos_save_product(shop,'{"id":"00000000-0000-4000-8000-000000000003","name":"New name","price_cents":15000,"active":true}');
 assert (select items->0->>'name' from public.pos_sales limit 1)='Latte';
 perform public.pos_refund(shop,'00000000-0000-4000-8000-000000000004','Customer returned payment');
 perform public.pos_refund(shop,'00000000-0000-4000-8000-000000000004','Retry');
 assert (select status from public.pos_sales limit 1)='refunded';
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$begin
 assert (select count(*) from public.pos_sales)=0;
 begin perform public.pos_sales(current_setting('test.shop')::uuid,current_date,current_date);raise exception 'Cross shop read accepted';exception when raise_exception then if sqlerrm='Cross shop read accepted' then raise;end if;end;
 begin perform public.pos_save_product(current_setting('test.shop')::uuid,'{"name":"Bad","price_cents":1,"active":true}');raise exception 'Cross shop write accepted';exception when raise_exception then if sqlerrm='Cross shop write accepted' then raise;end if;end;
end $$;
