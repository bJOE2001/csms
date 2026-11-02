create table public.business_settings (
  shop_id uuid primary key references public.shops(id), receipt_footer text not null default 'Thank you for visiting.' check(length(receipt_footer)<=500),
  address text not null default '' check(length(address)<=500), operating_hours text not null default '' check(length(operating_hours)<=500),
  payment_methods text[] not null default array['cash','gcash'], max_discount_bps integer not null default 2000 check(max_discount_bps between 0 and 10000),
  offline_hours integer not null default 12 check(offline_hours between 1 and 24)
);
create table public.startup_budgets (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), name text not null check(length(trim(name)) between 1 and 120),
  classification text not null check(classification in('operating','equipment','inventory_asset','working_cash','other')),
  planned_cents bigint not null check(planned_cents between 0 and 9007199254740991), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(shop_id,id)
);
create table public.founder_contributions (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, founder_id uuid not null references auth.users(id),
  classification text not null check(classification in('capital','loan','reimbursable')),
  amount_cents bigint not null check(amount_cents between 1 and 9007199254740991), method text not null check(length(method) between 1 and 80),
  reference text not null default '' check(length(reference)<=120), occurred_on date not null, document_path text,
  status text not null default 'pending' check(status in('pending','confirmed','rejected','reversed')),
  created_by uuid not null references auth.users(id), decided_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now(), unique(shop_id,id), foreign key(shop_id) references public.shops(id)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), category text not null check(length(trim(category)) between 1 and 120),
  classification text not null check(classification in('operating','equipment','inventory_asset','reimbursement')),
  amount_cents bigint not null check(amount_cents between 1 and 9007199254740991), occurred_on date not null,
  method text not null check(length(method) between 1 and 80), paid_by text not null check(length(trim(paid_by)) between 1 and 120),
  description text not null check(length(trim(description)) between 1 and 500), document_path text, purchase_id uuid,
  status text not null default 'pending' check(status in('pending','approved','rejected','reversed')),
  created_by uuid not null references auth.users(id), decided_by uuid references auth.users(id), decided_at timestamptz,
  created_at timestamptz not null default now(), unique(shop_id,id), foreign key(shop_id,purchase_id) references public.purchases(shop_id,id)
);
create table public.cashier_shifts (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, device_id uuid not null references public.pos_devices(id), cashier_id uuid not null references auth.users(id),
  opening_cents bigint not null check(opening_cents between 0 and 9007199254740991), opened_at timestamptz not null default now(), closed_at timestamptz,
  counted_cents bigint check(counted_cents between 0 and 9007199254740991), expected_cents bigint, close_note text,
  unresolved boolean not null default false, unique(shop_id,id), foreign key(shop_id) references public.shops(id)
);
create unique index one_open_shift_per_device on public.cashier_shifts(device_id) where closed_at is null;
create unique index one_open_shift_per_cashier on public.cashier_shifts(shop_id,cashier_id) where closed_at is null;
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null, shift_id uuid not null,
  amount_cents bigint not null check(amount_cents<>0 and abs(amount_cents)<=9007199254740991),
  reason text not null check(length(trim(reason)) between 1 and 500), status text not null default 'pending' check(status in('pending','approved','rejected')),
  created_by uuid not null references auth.users(id), decided_by uuid references auth.users(id), created_at timestamptz not null default now(),
  foreign key(shop_id,shift_id) references public.cashier_shifts(shop_id,id), unique(shop_id,id)
);
-- Store private object paths, never arbitrary external receipt URLs.
create function public.valid_business_document(p_shop uuid,p_path text) returns boolean language sql immutable set search_path='' as $$
  select p_path is null or (p_path like p_shop::text||'/%' and length(p_path)<300 and p_path not like '%..%');
$$;
alter table public.purchases add constraint purchase_document_scope check(public.valid_business_document(shop_id,document_path));
alter table public.expenses add constraint expense_document_scope check(public.valid_business_document(shop_id,document_path));
alter table public.founder_contributions add constraint funding_document_scope check(public.valid_business_document(shop_id,document_path));

create function public.can_approve_business_record(p_shop uuid,p_creator uuid) returns boolean language sql stable security definer set search_path='' as $$
  select public.is_shop_founder(p_shop) and (auth.uid()<>p_creator or
    (select count(*) from public.shop_members where shop_id=p_shop and role='founder' and status='active')=1);
$$;
create function public.guard_business_decision() returns trigger language plpgsql set search_path='' as $$ begin
  if (to_jsonb(new)-array['status','decided_by','decided_at']) is distinct from (to_jsonb(old)-array['status','decided_by','decided_at']) then
    raise exception 'Financial details are immutable; reverse and create a correction'; end if;
  return new;
end $$;
create trigger protect_expense_details before update on public.expenses for each row execute function public.guard_business_decision();
create trigger protect_funding_details before update on public.founder_contributions for each row execute function public.guard_business_decision();
create trigger no_delete_expenses before delete on public.expenses for each row execute function public.reject_history_change();
create trigger no_delete_funding before delete on public.founder_contributions for each row execute function public.reject_history_change();
create trigger no_delete_shifts before delete on public.cashier_shifts for each row execute function public.reject_history_change();

create function public.manage_finance(p_shop_id uuid,p_action text,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_id uuid; v_creator uuid; v_status text; v_shift public.cashier_shifts%rowtype;
begin
  perform public.require_business_access(p_shop_id,p_action not in('open_shift','cash_movement'));
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'finance.'||p_action,p_data);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id,p_action not in('open_shift','cash_movement'));
  case p_action
  when 'budget' then
    if p_data->>'id' is null then
      insert into public.startup_budgets(shop_id,name,classification,planned_cents,created_by) values(p_shop_id,p_data->>'name',p_data->>'classification',(p_data->>'amount_cents')::bigint,auth.uid()) returning id into v_id;
    else
      update public.startup_budgets set name=p_data->>'name',classification=p_data->>'classification',planned_cents=(p_data->>'amount_cents')::bigint
        where shop_id=p_shop_id and id=(p_data->>'id')::uuid returning id into v_id;
      if not found then raise exception 'Budget not found'; end if;
    end if;
  when 'funding' then
    if not exists(select 1 from public.shop_members where shop_id=p_shop_id and user_id=(p_data->>'founder_id')::uuid and role='founder' and status='active') then raise exception 'Active founder required'; end if;
    insert into public.founder_contributions(shop_id,founder_id,classification,amount_cents,method,reference,occurred_on,document_path,created_by)
      values(p_shop_id,(p_data->>'founder_id')::uuid,p_data->>'classification',(p_data->>'amount_cents')::bigint,p_data->>'method',coalesce(p_data->>'reference',''),(p_data->>'occurred_on')::date,p_data->>'document_path',auth.uid()) returning id into v_id;
  when 'expense' then
    insert into public.expenses(shop_id,category,classification,amount_cents,occurred_on,method,paid_by,description,document_path,purchase_id,created_by)
      values(p_shop_id,p_data->>'category',p_data->>'classification',(p_data->>'amount_cents')::bigint,(p_data->>'occurred_on')::date,p_data->>'method',p_data->>'paid_by',p_data->>'description',p_data->>'document_path',(p_data->>'purchase_id')::uuid,auth.uid()) returning id into v_id;
  when 'decide_expense','decide_funding' then
    v_id:=(p_data->>'id')::uuid;
    if p_action='decide_expense' then select created_by,status into v_creator,v_status from public.expenses where shop_id=p_shop_id and id=v_id for update;
    else select created_by,status into v_creator,v_status from public.founder_contributions where shop_id=p_shop_id and id=v_id for update; end if;
    if not found or not public.can_approve_business_record(p_shop_id,v_creator) then raise exception 'Another active founder must approve this record' using errcode='42501'; end if;
    if not ((v_status='pending' and p_data->>'decision' in('approve','reject')) or (v_status in('approved','confirmed') and p_data->>'decision'='reverse')) then raise exception 'Invalid financial decision'; end if;
    if length(trim(coalesce(p_data->>'reason','')))=0 then raise exception 'Decision reason required'; end if;
    v_status:=case p_data->>'decision' when 'approve' then case when p_action='decide_expense' then 'approved' else 'confirmed' end when 'reject' then 'rejected' else 'reversed' end;
    if p_action='decide_expense' then update public.expenses set status=v_status,decided_by=auth.uid(),decided_at=now() where id=v_id;
    else update public.founder_contributions set status=v_status,decided_by=auth.uid(),decided_at=now() where id=v_id; end if;
  when 'open_shift' then
    if not exists(select 1 from public.pos_devices where shop_id=p_shop_id and id=(p_data->>'device_id')::uuid and enabled) then raise exception 'Enabled POS device required'; end if;
    insert into public.cashier_shifts(shop_id,device_id,cashier_id,opening_cents) values(p_shop_id,(p_data->>'device_id')::uuid,auth.uid(),(p_data->>'opening_cents')::bigint) returning id into v_id;
  when 'cash_movement' then
    select * into strict v_shift from public.cashier_shifts where shop_id=p_shop_id and id=(p_data->>'shift_id')::uuid for update;
    if v_shift.closed_at is not null or (v_shift.cashier_id<>auth.uid() and not public.is_shop_founder(p_shop_id)) then raise exception 'Assigned open shift required'; end if;
    insert into public.cash_movements(shop_id,shift_id,amount_cents,reason,created_by)
      values(p_shop_id,v_shift.id,(p_data->>'amount_cents')::bigint,p_data->>'reason',auth.uid()) returning id into v_id;
  when 'decide_cash' then
    v_id:=(p_data->>'id')::uuid;
    select c.created_by,c.status into strict v_creator,v_status from public.cash_movements c join public.cashier_shifts s on s.id=c.shift_id where c.id=v_id and c.shop_id=p_shop_id and (s.closed_at is null or s.unresolved) for update of c,s;
    if v_status<>'pending' or p_data->>'decision' not in('approve','reject') or not public.can_approve_business_record(p_shop_id,v_creator) then raise exception 'Another founder decision required'; end if;
    update public.cash_movements set status=case when p_data->>'decision'='approve' then 'approved' else 'rejected' end,decided_by=auth.uid() where id=v_id;
  else raise exception 'Unknown finance action';
  end case;
  perform public.record_business_audit(p_shop_id,'finance.'||p_action,p_action,v_id,p_data);
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_id));
end $$;

-- Membership writes serialize per shop and cannot remove its final active founder.
create function public.protect_last_founder() returns trigger language plpgsql security definer set search_path='' as $$ begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.shop_id::text,4));
  if old.role='founder' and old.status='active' and (tg_op='DELETE' or new.role<>'founder' or new.status<>'active')
    and not exists(select 1 from public.shop_members where shop_id=old.shop_id and id<>old.id and role='founder' and status='active') then
    raise exception 'The last active founder cannot be removed'; end if;
  if tg_op='DELETE' then return old; end if;
  if new.shop_id<>old.shop_id or new.user_id<>old.user_id then raise exception 'Membership identity cannot change'; end if;
  return new;
end $$;
create trigger preserve_last_founder before update or delete on public.shop_members for each row execute function public.protect_last_founder();

create function public.manage_settings(p_shop_id uuid,p_action text,p_data jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_id uuid;
begin
  perform public.require_business_access(p_shop_id);
  v_result:=public.claim_business_operation(p_shop_id,p_operation_id,'settings.'||p_action,p_data);
  if v_result is not null then return v_result; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  case p_action
  when 'business' then
    update public.shops set name=p_data->>'name',timezone=p_data->>'timezone',setup_state=(p_data->>'setup_state')::public.shop_setup_state where id=p_shop_id;
    insert into public.business_settings(shop_id,address,receipt_footer,operating_hours,max_discount_bps,offline_hours,payment_methods)
      values(p_shop_id,coalesce(p_data->>'address',''),coalesce(p_data->>'receipt_footer',''),coalesce(p_data->>'operating_hours',''),(p_data->>'max_discount_bps')::int,(p_data->>'offline_hours')::int,array(select jsonb_array_elements_text(p_data->'payment_methods')))
      on conflict(shop_id) do update set address=excluded.address,receipt_footer=excluded.receipt_footer,operating_hours=excluded.operating_hours,max_discount_bps=excluded.max_discount_bps,offline_hours=excluded.offline_hours,payment_methods=excluded.payment_methods;
    if not exists(select 1 from public.business_settings where shop_id=p_shop_id and cardinality(payment_methods) between 1 and 10 and 'cash'=any(payment_methods)) then raise exception 'Include cash and at most 10 methods'; end if;
    v_id:=p_shop_id;
  when 'device' then
    if p_data->>'id' is null then
      insert into public.pos_devices(shop_id,name,offline_capable,enabled) values(p_shop_id,p_data->>'name',coalesce((p_data->>'offline_capable')::boolean,false),true) returning id into v_id;
    else
      update public.pos_devices set name=p_data->>'name',offline_capable=(p_data->>'offline_capable')::boolean,enabled=(p_data->>'enabled')::boolean where shop_id=p_shop_id and id=(p_data->>'id')::uuid returning id into v_id;
      if not found then raise exception 'Device not found'; end if;
    end if;
  when 'member' then
    v_id:=(p_data->>'user_id')::uuid;
    if exists(select 1 from public.shop_members where user_id=v_id and shop_id<>p_shop_id) then raise exception 'Account belongs to another shop'; end if;
    insert into public.shop_members(shop_id,user_id,role,status) values(p_shop_id,v_id,(p_data->>'role')::public.shop_member_role,(p_data->>'status')::public.shop_member_status)
      on conflict(shop_id,user_id) do update set role=excluded.role,status=excluded.status;
  when 'rename_category' then
    update public.categories set name=trim(p_data->>'name') where shop_id=p_shop_id and id=(p_data->>'id')::uuid returning id into v_id;
    if not found then raise exception 'Category not found'; end if;
  when 'rename_product' then
    update public.products set name=trim(p_data->>'name'),category_id=(p_data->>'category_id')::uuid where shop_id=p_shop_id and id=(p_data->>'id')::uuid returning id into v_id;
    if not found then raise exception 'Product not found'; end if;
  else raise exception 'Unknown settings action';
  end case;
  perform public.record_business_audit(p_shop_id,'settings.'||p_action,p_action,v_id,p_data);
  return public.finish_business_operation(p_shop_id,p_operation_id,jsonb_build_object('id',v_id));
end $$;

do $$ declare v_table text; begin
  foreach v_table in array array['business_settings','startup_budgets','founder_contributions','expenses','cashier_shifts','cash_movements'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on public.%I from public,anon,authenticated',v_table);
    execute format('grant select on public.%I to authenticated',v_table);
    execute format('create policy "Founders read" on public.%I for select to authenticated using(public.is_shop_founder(shop_id))',v_table);
  end loop;
end $$;
create policy "Assigned cashier reads shift" on public.cashier_shifts for select to authenticated using(public.is_shop_member(shop_id) and cashier_id=auth.uid());
create policy "Assigned cashier reads movements" on public.cash_movements for select to authenticated using(public.is_shop_member(shop_id) and exists(select 1 from public.cashier_shifts s where s.id=shift_id and s.cashier_id=auth.uid()));
revoke all on function public.can_approve_business_record(uuid,uuid),public.guard_business_decision(),public.protect_last_founder() from public,anon,authenticated;
revoke all on function public.manage_finance(uuid,text,jsonb,uuid),public.manage_settings(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.manage_finance(uuid,text,jsonb,uuid),public.manage_settings(uuid,text,jsonb,uuid) to authenticated;

-- Hosted Supabase Storage exists there, while the isolated SQL test cluster does not.
do $$ begin if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('business-documents','business-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
    on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  execute $policy$create policy "Founder private document read" on storage.objects for select to authenticated using(bucket_id='business-documents' and exists(select 1 from public.shop_members m where m.shop_id::text=split_part(name,'/',1) and m.user_id=auth.uid() and m.role='founder' and m.status='active'))$policy$;
  execute $policy$create policy "Founder private document upload" on storage.objects for insert to authenticated with check(bucket_id='business-documents' and exists(select 1 from public.shop_members m where m.shop_id::text=split_part(name,'/',1) and m.user_id=auth.uid() and m.role='founder' and m.status='active'))$policy$;
end if; end $$;
