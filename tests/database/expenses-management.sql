-- Editing uses the existing expense row, operation ledger and immutable audit log.
reset role;
select set_config('test.shop',(select id::text from public.shops where name='Test shop'),false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000501','expense-staff@test.invalid'),
 ('00000000-0000-4000-8000-000000000502','expense-outsider@test.invalid');
insert into public.shop_members(shop_id,user_id,role)
 values(current_setting('test.shop')::uuid,'00000000-0000-4000-8000-000000000501','staff');
set role authenticated;
do $$declare
 shop uuid:=current_setting('test.shop')::uuid;
 source jsonb:=jsonb_build_object('id','00000000-0000-4000-8000-000000000503','spent_on',current_date,'description','Rent','amount_cents',2500);
 original jsonb; command jsonb; updated jsonb; later jsonb;
begin
 original:=public.pos_add_expense(shop,source);
 command:=jsonb_build_object('id',source->>'id','operation_id','00000000-0000-4000-8000-000000000504',
  'spent_on',current_date-1,'description','Corrected rent','amount_cents',7500,
  'expected',jsonb_build_object('spent_on',current_date,'description','Rent','amount_cents',2500));
 updated:=public.pos_update_expense(shop,command);
 assert updated->>'id'=original->>'id';
 assert updated->>'created_at'=original->>'created_at';
 assert updated->>'created_by'=original->>'created_by';
 assert (select count(*) from public.pos_expenses where id=(source->>'id')::uuid)=1;
 assert (select count(*) from jsonb_array_elements(public.pos_expenses(shop,current_date,current_date)) e where e->>'id'=source->>'id')=0;
 assert (select (e->>'amount_cents')::bigint from jsonb_array_elements(public.pos_expenses(shop,current_date-1,current_date-1)) e where e->>'id'=source->>'id')=7500;
 assert (select context->'before'->>'description' from public.audit_logs where entity_id=(source->>'id')::uuid and action='pos.expense.updated')='Rent';
 assert (select context->'after'->>'amount_cents' from public.audit_logs where entity_id=(source->>'id')::uuid and action='pos.expense.updated')='7500';
 perform public.pos_update_expense(shop,command);
 assert (select count(*) from public.audit_logs where entity_id=(source->>'id')::uuid and action='pos.expense.updated')=1;

 later:=command||jsonb_build_object('operation_id','00000000-0000-4000-8000-000000000505','amount_cents',8000,
  'expected',jsonb_build_object('spent_on',current_date-1,'description','Corrected rent','amount_cents',7500));
 perform public.pos_update_expense(shop,later);
 -- A delayed retry after another edit must not overwrite that later edit.
 assert public.pos_update_expense(shop,command)=updated;
 assert (select amount_cents from public.pos_expenses where id=(source->>'id')::uuid)=8000;
 begin
  perform public.pos_update_expense(shop,command||jsonb_build_object('operation_id','00000000-0000-4000-8000-000000000506'));
  raise exception 'Stale edit accepted';
 exception when raise_exception then if sqlerrm='Stale edit accepted' then raise; end if; end;
 begin
  perform public.pos_update_expense(shop,jsonb_set(command,'{amount_cents}','1.5'));
  raise exception 'Fractional expense accepted';
 exception when raise_exception then if sqlerrm='Fractional expense accepted' then raise; end if; end;
 begin
  perform public.pos_update_expense(shop,jsonb_set(command,'{amount_cents}','0'));
  raise exception 'Zero expense accepted';
 exception when raise_exception then if sqlerrm='Zero expense accepted' then raise; end if; end;
 begin
  perform public.pos_update_expense(shop,jsonb_set(command,'{amount_cents}','999'));
  raise exception 'Changed operation replay accepted';
 exception when raise_exception then if sqlerrm='Changed operation replay accepted' then raise; end if; end;
 perform public.pos_void_expense(shop,(source->>'id')::uuid);
 assert (select voided from public.pos_expenses where id=(source->>'id')::uuid);
 assert (select coalesce(sum((e->>'amount_cents')::bigint),0) from jsonb_array_elements(public.pos_expenses(shop,current_date-1,current_date)) e where not (e->>'voided')::boolean)=0;
 begin
  perform public.pos_update_expense(shop,later||jsonb_build_object('operation_id','00000000-0000-4000-8000-000000000507'));
  raise exception 'Voided expense edited';
 exception when raise_exception then if sqlerrm='Voided expense edited' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',false);
do $$begin
 assert jsonb_array_length(public.pos_expenses(current_setting('test.shop')::uuid,current_date-1,current_date))>=1;
 begin
  perform public.pos_update_expense(current_setting('test.shop')::uuid,'{}');
  raise exception 'Staff expense edit accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.pos_void_expense(current_setting('test.shop')::uuid,'00000000-0000-4000-8000-000000000503');
  raise exception 'Staff expense deletion accepted';
 exception when raise_exception then if sqlerrm='Staff expense deletion accepted' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',false);
do $$begin
 begin
  perform public.pos_update_expense(current_setting('test.shop')::uuid,'{}');
  raise exception 'Cross-shop expense edit accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Rollback removes only the new command; existing records and old APIs remain usable.
begin;
drop function public.pos_update_expense(uuid,jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$begin
 assert jsonb_array_length(public.pos_expenses(current_setting('test.shop')::uuid,current_date-1,current_date))>=1;
end $$;
rollback;
