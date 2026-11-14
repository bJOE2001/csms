begin;

-- Safe to rerun after a complete or partial SQL Editor application. Existing
-- users, invitations and permission values are retained throughout the upgrade.
-- Additive: NULL keeps legacy staff access until an owner saves an explicit map.
create or replace function public.shop_permission_catalog() returns jsonb language sql immutable set search_path='' as $$
 select '{"dashboard":["view"],"pos":["view","checkout"],"menu":["view","create","edit","delete"],"inventory":["view","create","edit","stock","recipe","return"],"sales":["view","refund","print","export"],"expenses":["view","create","edit","delete"],"libraries":["view","create","edit","delete"]}'::jsonb;
$$;
create or replace function public.valid_shop_permissions(p_permissions jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare entry record; allowed jsonb:=public.shop_permission_catalog();
begin
 if p_permissions is null then return true;end if;
 if jsonb_typeof(p_permissions)<>'object' then return false;end if;
 for entry in select * from jsonb_each(p_permissions) loop
  if not allowed ? entry.key or jsonb_typeof(entry.value)<>'array' then return false;end if;
  if not entry.value <@ (allowed->entry.key) or jsonb_array_length(entry.value)<>(select count(distinct value) from jsonb_array_elements(entry.value))
   or (jsonb_array_length(entry.value)>0 and not entry.value ? 'view') then return false;end if;
 end loop;
 return true;
end $$;
alter table public.shop_members add column if not exists permissions jsonb;
alter table public.membership_invites add column if not exists permissions jsonb;
-- A partial application may have added a column without its validation check.
do $$begin
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.shop_members'::regclass and conname='shop_members_permissions_check') then
  alter table public.shop_members add constraint shop_members_permissions_check check(public.valid_shop_permissions(permissions));
 end if;
 if not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.membership_invites'::regclass and conname='membership_invites_permissions_check') then
  alter table public.membership_invites add constraint membership_invites_permissions_check check(public.valid_shop_permissions(permissions));
 end if;
end $$;

create or replace function public.has_shop_permission(p_shop_id uuid,p_module text,p_action text default 'view') returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select m.role='founder' or (p_module<>'users'
  and (public.shop_permission_catalog()->p_module) ? p_action
  and (coalesce(m.permissions,'{"pos":["view","checkout"],"menu":["view"],"libraries":["view"],"sales":["view","print","export"],"expenses":["view"]}'::jsonb)->p_module) ? 'view'
  and (coalesce(m.permissions,'{"pos":["view","checkout"],"menu":["view"],"libraries":["view"],"sales":["view","print","export"],"expenses":["view"]}'::jsonb)->p_module) ? p_action)
 from public.shop_members m where m.shop_id=p_shop_id and m.user_id=auth.uid() and m.status='active'),false);
$$;
create or replace function public.require_shop_permission(p_shop_id uuid,p_module text,p_action text default 'view') returns void
language plpgsql security definer set search_path='' as $$begin
 -- User changes and writes serialize on the existing shop lock.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if not public.has_shop_permission(p_shop_id,p_module,p_action) then raise exception 'You do not have permission for this action.' using errcode='42501';end if;
end $$;
create or replace function public.require_shop_read(p_shop_id uuid,p_module text) returns void
language plpgsql stable security definer set search_path='' as $$begin
 if not (case p_module
  when 'catalog' then public.has_shop_permission(p_shop_id,'pos') or public.has_shop_permission(p_shop_id,'menu') or public.has_shop_permission(p_shop_id,'libraries') or public.has_shop_permission(p_shop_id,'inventory')
  when 'expenses' then public.has_shop_permission(p_shop_id,'expenses') or public.has_shop_permission(p_shop_id,'sales') or public.has_shop_permission(p_shop_id,'dashboard')
  else public.has_shop_permission(p_shop_id,'sales') or public.has_shop_permission(p_shop_id,'dashboard') end)
 then raise exception 'You do not have access to this module.' using errcode='42501';end if;
end $$;
create or replace function public.shop_write_action(p_shop_id uuid,p_module text,p_id text) returns text
language plpgsql security definer set search_path='' as $$
declare existing boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if p_module='menu' then select exists(select 1 from public.pos_products where shop_id=p_shop_id and id=p_id::uuid) into existing;
 elsif p_module='libraries' then select exists(select 1 from public.pos_categories where shop_id=p_shop_id and id=p_id::uuid) into existing;
 elsif p_module='inventory' then select exists(select 1 from public.ingredients where shop_id=p_shop_id and id=p_id::uuid) into existing;
 else raise exception 'Unknown module';end if;
 return case when existing then 'edit' else 'create' end;
end $$;

-- Retired staff RPCs must not bypass revoked POS access. Owner-only legacy
-- commands retain their original policy and the current RPCs use specific grants.
create or replace function public.require_business_access(p_shop uuid,p_founder boolean default true) returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_shop_member(p_shop)
  or (p_founder and not public.is_shop_founder(p_shop))
  or (not p_founder and not public.has_shop_permission(p_shop,'pos','checkout'))
 then raise exception 'Access denied' using errcode='42501';end if;
end $$;

drop policy if exists pos_products_read on public.pos_products;
create policy pos_products_read on public.pos_products for select to authenticated using(
 public.has_shop_permission(shop_id,'pos') or public.has_shop_permission(shop_id,'menu') or public.has_shop_permission(shop_id,'libraries') or public.has_shop_permission(shop_id,'inventory'));
drop policy if exists pos_categories_read on public.pos_categories;
create policy pos_categories_read on public.pos_categories for select to authenticated using(
 public.has_shop_permission(shop_id,'pos') or public.has_shop_permission(shop_id,'menu') or public.has_shop_permission(shop_id,'libraries') or public.has_shop_permission(shop_id,'inventory'));
drop policy if exists pos_sales_read on public.pos_sales;
create policy pos_sales_read on public.pos_sales for select to authenticated using(public.has_shop_permission(shop_id,'sales') or public.has_shop_permission(shop_id,'dashboard'));
drop policy if exists pos_expenses_read on public.pos_expenses;
create policy pos_expenses_read on public.pos_expenses for select to authenticated using(public.has_shop_permission(shop_id,'expenses') or public.has_shop_permission(shop_id,'sales') or public.has_shop_permission(shop_id,'dashboard'));

create or replace function public.read_shop_users(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_shop_founder(p_shop_id) then raise exception 'Only an owner can manage users.' using errcode='42501';end if;
 return jsonb_build_object('user_id',auth.uid(),
  'members',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('email',u.email,'display_name',coalesce(nullif(trim(p.display_name),''),nullif(trim(u.raw_user_meta_data->>'display_name'),''))) order by m.created_at)
   from public.shop_members m join auth.users u on u.id=m.user_id left join public.profiles p on p.user_id=m.user_id where m.shop_id=p_shop_id),'[]'),
  'invitations',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.membership_invites i where i.shop_id=p_shop_id and i.status='pending'),'[]'));
end $$;
create or replace function public.manage_shop_user(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.shop_members; v_token uuid; before_entry jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if not public.is_shop_founder(p_shop_id) then raise exception 'Only an owner can manage users.' using errcode='42501';end if;
 if p_data->>'action' in ('invite','update') and (p_data->'permissions' is null or p_data->'permissions'='null'::jsonb or not public.valid_shop_permissions(p_data->'permissions')) then raise exception 'Choose valid module permissions.';end if;
 case p_data->>'action'
 when 'invite' then
  if exists(select 1 from public.shop_members m join auth.users u on u.id=m.user_id where m.shop_id=p_shop_id and lower(u.email)=lower(trim(p_data->>'email')))
   then raise exception 'This account is already a member. Edit their existing access.';end if;
  v_token:=public.create_membership_invite(p_shop_id,p_data->>'email','staff');
  update public.membership_invites set permissions=p_data->'permissions' where membership_invites.token=v_token;
  perform public.record_business_audit(p_shop_id,'membership.invite_permissions','invitation',v_token,p_data->'permissions');
  return jsonb_build_object('token',v_token);
 when 'update' then
  select * into member from public.shop_members where shop_id=p_shop_id and id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'User not found.';end if;
  if member.role='founder' or member.user_id=auth.uid() then raise exception 'Owner accounts retain full access and cannot be suspended here.' using errcode='42501';end if;
  if p_data->>'status' is null or p_data->>'status' not in ('active','suspended') then raise exception 'Choose Active or Suspended.';end if;
  before_entry:=to_jsonb(member);
  update public.shop_members set status=(p_data->>'status')::public.shop_member_status,permissions=p_data->'permissions' where id=member.id returning * into member;
  perform public.record_business_audit(p_shop_id,'membership.access_updated','member',member.user_id,jsonb_build_object('before',before_entry,'after',to_jsonb(member)));
  return to_jsonb(member);
 when 'revoke' then
  perform public.revoke_membership_invite(p_shop_id,(p_data->>'id')::uuid);return '{}'::jsonb;
 else raise exception 'Unknown user action.';end case;
end $$;

create or replace function public.membership_invite_details(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',i.email,'shop_name',s.name,'expires_at',i.expires_at)
 from public.membership_invites i join public.shops s on s.id=i.shop_id
 where i.token=p_token and i.status='pending' and i.expires_at>now();
$$;
create or replace function public.accept_membership_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_invite public.membership_invites%rowtype;v_email text;begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into strict v_invite from public.membership_invites where token=p_token;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invite.shop_id::text,4));
 select * into strict v_invite from public.membership_invites where token=p_token for update;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_invite.status='accepted' and v_invite.accepted_by=auth.uid() then return v_invite.shop_id;end if;
 if v_email is null or v_email<>v_invite.email or v_invite.status<>'pending' or v_invite.expires_at<=now() then raise exception 'Invitation is invalid, expired, or belongs to another verified email' using errcode='42501';end if;
 if exists(select 1 from public.shop_members where user_id=auth.uid()) then raise exception 'Account already has a shop membership';end if;
 insert into public.shop_members(shop_id,user_id,role,status,permissions) values(v_invite.shop_id,auth.uid(),v_invite.role,'active',v_invite.permissions);
 insert into public.profiles(user_id,display_name)
  select u.id,left(nullif(trim(u.raw_user_meta_data->>'display_name'),''),120)
  from auth.users u where u.id=auth.uid() and nullif(trim(u.raw_user_meta_data->>'display_name'),'') is not null
  on conflict(user_id) do update set display_name=coalesce(nullif(trim(profiles.display_name),''),excluded.display_name),updated_at=now();
 update public.membership_invites set status='accepted',accepted_by=auth.uid() where id=v_invite.id;
 perform public.record_business_audit(v_invite.shop_id,'membership.invitation_accepted','member',auth.uid(),jsonb_build_object('invitation_id',v_invite.id));
 return v_invite.shop_id;
end $$;

create or replace function public.resolve_shop_access() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_token uuid; v_email text;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select shop_id into v_shop from public.shop_members where user_id=auth.uid() and status='active' order by created_at limit 1;
 if v_shop is not null then return v_shop;end if;
 if exists(select 1 from public.shop_members where user_id=auth.uid()) then return null;end if;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is not null then
  select token into v_token from public.membership_invites where email=v_email and status='pending' and expires_at>now() order by created_at desc limit 1;
  if v_token is not null then return public.accept_membership_invite(v_token);end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('single_shop_bootstrap',0));
 if not exists(select 1 from public.shops) then
  return public.create_shop('Sip&Snap','Asia/Manila');
 end if;
 return null;
end $$;

revoke all on function public.shop_permission_catalog(),public.valid_shop_permissions(jsonb),public.has_shop_permission(uuid,text,text),public.require_shop_permission(uuid,text,text),public.require_shop_read(uuid,text),public.shop_write_action(uuid,text,text),public.read_shop_users(uuid),public.manage_shop_user(uuid,jsonb),public.membership_invite_details(uuid),public.resolve_shop_access() from public,anon,authenticated;
grant execute on function public.shop_permission_catalog(),public.valid_shop_permissions(jsonb),public.has_shop_permission(uuid,text,text),public.read_shop_users(uuid),public.manage_shop_user(uuid,jsonb),public.resolve_shop_access() to authenticated;
grant execute on function public.membership_invite_details(uuid) to anon,authenticated;

-- Function bodies below preserve the current validation, locks, idempotence,
-- recipe costing, receipts and inventory posting. Only authorization changes.
create or replace function public.pos_checkout(p_shop_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sale_id uuid; captured timestamptz; result jsonb;
begin
 perform public.require_shop_permission(p_shop_id,'pos','checkout');
 sale_id:=(p_data->>'id')::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(sale_id::text,0));
 -- Replays must keep working after the upload window has elapsed. The existing
 -- helper verifies the original shop, cashier and complete request, including
 -- captured_at, before returning; no stock is consumed a second time.
 if exists(select 1 from public.pos_sales where id=sale_id) then
  return public.pos_checkout_before_offline(p_shop_id,p_data);
 end if;
 if p_data ? 'captured_at' then
  if jsonb_typeof(p_data->'captured_at') is distinct from 'string'
   or (p_data->>'captured_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' then
   raise exception 'Invalid sale capture time';
  end if;
  begin
   captured:=(p_data->>'captured_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Invalid sale capture time';
  end;
  if captured>now()+interval '5 minutes' or captured<now()-interval '30 days' then
   raise exception 'Sale capture time must be within the last 30 days and no more than 5 minutes ahead. Review this saved sale.';
  end if;
 end if;
 result:=public.pos_checkout_before_offline(p_shop_id,p_data);
 -- created_at remains the business/report/receipt date. received_at records
 -- when production accepted the sale. Inventory uses the active recipe and
 -- stock/cost at acceptance; its immutable movements retain their posting time.
 if captured is not null then update public.pos_sales set created_at=captured where id=sale_id;end if;
 return result;
end $$;

create or replace function public.pos_save_product(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare stored public.pos_products; sizes jsonb; s jsonb; previous jsonb; normalized jsonb:=p_data;
begin
 perform public.require_shop_permission(p_shop_id,'menu',public.shop_write_action(p_shop_id,'menu',p_data->>'id'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if p_data ? 'cost_cents' or exists(select 1 from jsonb_array_elements(coalesce(p_data->'sizes','[]')) x where x ? 'cost_cents') then raise exception 'Preparation costs are calculated from inventory recipes.';end if;
 select * into stored from public.pos_products where shop_id=p_shop_id and id=(p_data->>'id')::uuid for update;
 sizes:='[]';
 for s in select value from jsonb_array_elements(coalesce(p_data->'sizes',stored.sizes,'[]')) loop
  select value into previous from jsonb_array_elements(coalesce(stored.sizes,'[]')) where value->>'id'=s->>'id';
  sizes:=sizes||jsonb_build_array(s||jsonb_build_object('cost_cents',previous->'cost_cents'));
 end loop;
 normalized:=normalized||jsonb_build_object('cost_cents',stored.cost_cents,'sizes',sizes);
 return public.pos_save_product_compatibility(p_shop_id,normalized);
end $$;

create or replace function public.pos_save_product_compatibility(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_products; previous public.pos_products; product_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid());
 category uuid; configured jsonb; default_size jsonb; base_price bigint; base_cost bigint;
begin
 perform public.require_shop_permission(p_shop_id,'menu',public.shop_write_action(p_shop_id,'menu',p_data->>'id'));
 if p_data->>'name' is null or length(trim(p_data->>'name')) not between 1 and 120 or jsonb_typeof(p_data->'active') is distinct from 'boolean' or jsonb_typeof(p_data->'price_cents') is distinct from 'number' or (p_data->>'price_cents')::numeric<>trunc((p_data->>'price_cents')::numeric) or (p_data->>'price_cents')::numeric not between 0 and 100000000 then raise exception 'Invalid product name or price';end if;
 if p_data->>'cost_cents' is not null and (jsonb_typeof(p_data->'cost_cents') is distinct from 'number' or (p_data->>'cost_cents')::numeric<>trunc((p_data->>'cost_cents')::numeric) or (p_data->>'cost_cents')::numeric not between 0 and 100000000) then raise exception 'Invalid product cost';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(product_id::text,0));
 select * into previous from public.pos_products where id=product_id for update;
 if found and (previous.shop_id<>p_shop_id or previous.archived_at is not null) then raise exception 'Product cannot be edited';end if;
 category:=case when p_data ? 'category_id' then (p_data->>'category_id')::uuid else previous.category_id end;
 if category is not null then
  perform 1 from public.pos_categories where id=category and shop_id=p_shop_id for share;
  if not found then raise exception 'Choose a category from this shop';end if;
 end if;
 configured:=case when p_data ? 'sizes' then p_data->'sizes' else coalesce(previous.sizes,'[]') end;
 if not public.pos_valid_sizes(configured) then raise exception 'Check size labels, prices and default size';end if;
 -- Trim labels once, so selection snapshots and duplicate checks use the same labels.
 select coalesce(jsonb_agg(value || jsonb_build_object('label',trim(value->>'label'))),'[]') into configured from jsonb_array_elements(configured);
 base_price:=(p_data->>'price_cents')::bigint;
 base_cost:=case when p_data ? 'cost_cents' then (p_data->>'cost_cents')::bigint else previous.cost_cents end;
 if jsonb_array_length(configured)>0 then
  select value into default_size from jsonb_array_elements(configured) where (value->>'is_default')::boolean;
  if not(p_data ? 'sizes') and (base_price is distinct from previous.price_cents or base_cost is distinct from previous.cost_cents) then raise exception 'Use Menu Management to change size prices and costs';end if;
  base_price:=(default_size->>'price_cents')::bigint;base_cost:=(default_size->>'cost_cents')::bigint;
 end if;
 insert into public.pos_products(id,shop_id,name,price_cents,cost_cents,active,category_id,description,image_url,sizes)
 values(product_id,p_shop_id,trim(p_data->>'name'),base_price,base_cost,(p_data->>'active')::boolean,category,
  case when p_data ? 'description' then trim(p_data->>'description') else coalesce(previous.description,'') end,
  case when p_data ? 'image_url' then p_data->>'image_url' else previous.image_url end,configured)
 on conflict(id) do update set name=excluded.name,price_cents=excluded.price_cents,cost_cents=excluded.cost_cents,active=excluded.active,category_id=excluded.category_id,description=excluded.description,image_url=excluded.image_url,sizes=excluded.sizes
 returning * into result;
 return to_jsonb(result);
end $$;

create or replace function public.pos_save_category(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_categories; category_id uuid:=coalesce((p_data->>'id')::uuid,gen_random_uuid()); label text:=trim(p_data->>'name');
begin
 perform public.require_shop_permission(p_shop_id,'libraries',public.shop_write_action(p_shop_id,'libraries',p_data->>'id'));
 if label is null or length(label) not between 1 and 60 then raise exception 'Enter a category name of up to 60 characters';end if;
 insert into public.pos_categories(id,shop_id,name) values(category_id,p_shop_id,label)
 on conflict(id) do update set name=excluded.name where pos_categories.shop_id=p_shop_id returning * into result;
 if result.id is null then raise exception 'Category belongs to another shop';end if;
 return to_jsonb(result);
exception when unique_violation then raise exception 'A category with this name already exists';
end $$;

create or replace function public.pos_delete_category(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_shop_permission(p_shop_id,'libraries','delete');
 perform 1 from public.pos_categories where id=p_id and shop_id=p_shop_id for update;
 if not found then raise exception 'Category not found';end if;
 if exists(select 1 from public.pos_products where category_id=p_id and archived_at is null) then raise exception 'Reassign products in this category before deleting it';end if;
 delete from public.pos_categories where id=p_id and shop_id=p_shop_id;
end $$;

create or replace function public.pos_archive_product(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_shop_permission(p_shop_id,'menu','delete');
 update public.pos_products set active=false,archived_at=coalesce(archived_at,now()) where id=p_id and shop_id=p_shop_id;
 if not found then raise exception 'Product not found';end if;
end $$;

create or replace function public.pos_refund(p_shop_id uuid,p_sale_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_shop_permission(p_shop_id,'sales','refund');
 if p_reason is null or length(trim(p_reason)) not between 1 and 500 then raise exception 'Enter a refund reason';end if;
 update public.pos_sales set status='refunded',payment_status='refunded',refund_reason=trim(p_reason),refunded_by=auth.uid(),refunded_at=now() where id=p_sale_id and shop_id=p_shop_id and status='completed';
 if not found and not exists(select 1 from public.pos_sales where id=p_sale_id and shop_id=p_shop_id and status='refunded') then raise exception 'Sale cannot be refunded';end if;
end $$;

create or replace function public.pos_add_expense(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.pos_expenses; expense_id uuid:=(p_data->>'id')::uuid; classification text:=coalesce(p_data->>'classification','operating_expense');
begin
 perform public.require_shop_permission(p_shop_id,'expenses','create');
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
 perform public.require_shop_permission(p_shop_id,'expenses','edit');
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

create or replace function public.pos_void_expense(p_shop_id uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.require_shop_permission(p_shop_id,'expenses','delete');
 update public.pos_expenses set voided=true where id=p_id and shop_id=p_shop_id;
 if not found then raise exception 'Expense not found';end if;
end $$;

create or replace function public.pos_inventory_create_item(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare initial jsonb:=p_data->'initial_stock'; item jsonb; replay jsonb; op uuid:=(initial->>'operation_id')::uuid;
begin
 perform public.require_shop_permission(p_shop_id,'inventory',public.shop_write_action(p_shop_id,'inventory',p_data->>'id'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if initial is null then return public.pos_inventory_save_item(p_shop_id,p_data);end if;
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.create',p_data);if replay is not null then return replay;end if;
 if exists(select 1 from public.ingredients where id=(p_data->>'id')::uuid) then raise exception 'Initial stock is only available when creating an item.';end if;
 item:=public.pos_inventory_save_item(p_shop_id,p_data-'initial_stock');
 perform public.pos_inventory_post(p_shop_id,jsonb_build_object('operation_id',md5(op::text||':stock')::uuid,'ingredient_id',p_data->>'id','kind','opening','quantity',initial->>'quantity','purchase_unit',p_data->>'base_unit','total_cost_cents',initial->'total_cost_cents','occurred_on',initial->>'occurred_on','reason','Initial stock'));
 return public.finish_business_operation(p_shop_id,op,item);
end $$;

create or replace function public.pos_inventory_save_item(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 previous_item public.ingredients;
 item public.ingredients;
 was_found boolean:=false;
 item_id uuid:=(p_data->>'id')::uuid;
 unit public.ingredient_unit:=(p_data->>'base_unit')::public.ingredient_unit;
 v_type text:=p_data->>'item_type';
 threshold numeric:=(p_data->>'minimum_stock')::numeric;
begin
 perform public.require_shop_permission(p_shop_id,'inventory',public.shop_write_action(p_shop_id,'inventory',p_data->>'id'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 if item_id is null or length(trim(p_data->>'name')) not between 1 and 120 or p_data->>'name' is null or unit is null or v_type is null or v_type not in ('ingredient','supply','finished_good') or threshold is null or threshold<0 or threshold>=1000000000000 or threshold<>round(threshold,6) or (unit='each' and threshold<>trunc(threshold)) or jsonb_typeof(p_data->'active') is distinct from 'boolean' then
  raise exception 'Check item name, unit, threshold and status';
 end if;
 select * into previous_item from public.ingredients where shop_id=p_shop_id and id=item_id for update;
 was_found:=found;
 if was_found and previous_item.base_unit<>unit and (
  exists(select 1 from public.stock_movements where ingredient_id=item_id)
  or exists(select 1 from public.recipe_items where ingredient_id=item_id)
  or exists(select 1 from public.pos_recipe_versions r cross join lateral jsonb_array_elements(r.components) c where r.shop_id=p_shop_id and (c->>'ingredient_id')::uuid=item_id)
 ) then
  raise exception 'Base unit cannot change after stock movements or recipe use';
 end if;
 if was_found and previous_item.item_type='finished_good' and v_type<>'finished_good' and exists(
  select 1 from public.pos_inventory_configs cfg
  join public.pos_recipe_versions r on r.id=cfg.active_recipe_id and r.shop_id=cfg.shop_id
  cross join lateral jsonb_array_elements(r.components) c
  where cfg.shop_id=p_shop_id and r.mode='finished_good' and (c->>'ingredient_id')::uuid=item_id
 ) then
  raise exception 'Deactivate finished-good product tracking before changing this item type';
 end if;
 insert into public.ingredients(id,shop_id,name,base_unit,minimum_stock,item_type,notes,active)
 values(item_id,p_shop_id,trim(p_data->>'name'),unit,threshold,v_type,coalesce(p_data->>'notes',''),(p_data->>'active')::boolean)
 on conflict(id) do update
  set name=excluded.name,base_unit=excluded.base_unit,minimum_stock=excluded.minimum_stock,item_type=excluded.item_type,notes=excluded.notes,active=excluded.active
  where ingredients.shop_id=p_shop_id
 returning * into item;
 if item.id is null then raise exception 'Inventory item belongs to another shop';end if;
 perform public.record_business_audit(
  p_shop_id,
  'inventory.item.saved',
  'ingredient',
  item.id,
  case when was_found then p_data||jsonb_build_object('before',to_jsonb(previous_item)) else p_data end
 );
 return to_jsonb(item);
exception when unique_violation then
 raise exception 'An inventory item with this name already exists';
end $$;

create or replace function public.pos_inventory_post(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; item public.ingredients; b public.inventory_balances; replay jsonb;
 kind text:=p_data->>'kind'; entered numeric:=(p_data->>'quantity')::numeric; qty numeric; delta numeric;
 unit text:=p_data->>'purchase_unit'; value bigint; cost numeric:=(p_data->>'total_cost_cents')::numeric; reason text:=trim(p_data->>'reason'); day date:=(p_data->>'occurred_on')::date;
begin
 perform public.require_shop_permission(p_shop_id,'inventory','stock');
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.post',p_data); if replay is not null then return replay;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 select * into item from public.ingredients where shop_id=p_shop_id and id=(p_data->>'ingredient_id')::uuid and active for update;
 if not found then raise exception 'Choose an active inventory item';end if;
 if kind is null or kind not in ('opening','receipt','count','waste','correction') or entered is null or entered<>round(entered,6) or abs(entered)>=1000000000 or day is null or reason is null or length(reason) not between 1 and 500 then raise exception 'Check stock quantity, date and reason';end if;
 if cost is not null and (cost<>trunc(cost) or cost not between 0 and 100000000000) then raise exception 'Enter a nonnegative purchase cost';end if;
 qty:=case when unit=item.base_unit::text then entered when unit='kg' and item.base_unit='g' then entered*1000 when unit='L' and item.base_unit='ml' then entered*1000 else null end;
 if qty is null or (item.base_unit='each' and qty<>trunc(qty)) then raise exception 'Purchase unit must match the item base unit';end if;
 insert into public.inventory_balances(shop_id,ingredient_id,value_cents) values(p_shop_id,item.id,0) on conflict do nothing;
 select * into strict b from public.inventory_balances where shop_id=p_shop_id and ingredient_id=item.id for update;
 if kind='count' then
  if qty<0 then raise exception 'Count cannot be negative';end if;
  if (p_data->>'expected_revision')::bigint is distinct from b.revision then raise exception 'Stock changed after this count was opened. Refresh and count again.';end if;
  delta:=qty-b.quantity;
 elsif kind='waste' then
  if qty<=0 then raise exception 'Enter the quantity lost';end if;delta:=-qty;
 else delta:=qty;
 end if;
 if kind in ('opening','receipt') and (qty<=0 or cost is null) then raise exception 'Enter a positive quantity and its actual total purchase cost (zero is allowed)';end if;
 if kind='opening' and exists(select 1 from public.stock_movements where shop_id=p_shop_id and ingredient_id=item.id) then raise exception 'Opening stock already recorded. Use Stock In or a physical count.';end if;
 if kind='correction' and delta=0 then raise exception 'Adjustment cannot be zero';end if;
 if delta>0 then
  value:=case when cost is not null then cost::bigint when b.quantity>0 and b.value_cents is not null then ceil(delta*b.value_cents/b.quantity)::bigint else null end;
  if value is null then raise exception 'Enter the actual cost of the additional stock';end if;
 end if;
 insert into public.pos_stock_documents(id,shop_id,ingredient_id,kind,occurred_on,purchase_unit,entered_quantity,purchase_cost_cents,supplier,reference,reason,notes,expected_revision,created_by)
 values(op,p_shop_id,item.id,kind,day,unit,entered,cost::bigint,coalesce(p_data->>'supplier',''),coalesce(p_data->>'reference',''),reason,coalesce(p_data->>'notes',''),(p_data->>'expected_revision')::bigint,auth.uid());
 if kind='count' and cost is not null then value:=cost::bigint;end if;
 perform public.pos_inventory_move(p_shop_id,item.id,delta,value,kind,op,reason,kind='count' and cost is not null);
 perform public.record_business_audit(p_shop_id,'inventory.'||kind,'ingredient',item.id,p_data);
 return public.finish_business_operation(p_shop_id,op,jsonb_build_object('id',op));
end $$;

create or replace function public.pos_inventory_recipe(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; prod public.pos_products; cfg public.pos_inventory_configs; comp jsonb; item public.ingredients;
 v_size_id uuid:=(p_data->>'size_id')::uuid; v_product_id uuid:=(p_data->>'product_id')::uuid; action text:=p_data->>'action'; mode text:=p_data->>'mode';
 quantity numeric; parts jsonb:='[]'; ids uuid[]:='{}'; recipe_id uuid; next_version integer; replay jsonb; info jsonb;
begin
 perform public.require_shop_permission(p_shop_id,'inventory','recipe');
 replay:=public.claim_business_operation(p_shop_id,op,'pos.inventory.recipe',p_data);if replay is not null then return replay;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
 select * into prod from public.pos_products where shop_id=p_shop_id and id=v_product_id and archived_at is null for update;
 if not found then raise exception 'Product not found';end if;
 if (jsonb_array_length(prod.sizes)=0 and v_size_id is not null) or (jsonb_array_length(prod.sizes)>0 and not exists(select 1 from jsonb_array_elements(prod.sizes) s where (s->>'id')::uuid=v_size_id)) then raise exception 'Choose a current product size';end if;
 insert into public.pos_inventory_configs(shop_id,product_id,size_key) values(p_shop_id,v_product_id,coalesce(v_size_id::text,'')) on conflict do nothing;
 select * into strict cfg from public.pos_inventory_configs c where c.shop_id=p_shop_id and c.product_id=prod.id and size_key=coalesce(v_size_id::text,'') for update;
 if (p_data->>'expected_revision')::bigint is distinct from cfg.revision then raise exception 'Recipe changed. Reopen it before saving.';end if;
 if action='draft' then
  if mode is null or mode not in ('recipe','finished_good') or jsonb_typeof(p_data->'components') is distinct from 'array' or jsonb_array_length(p_data->'components')>50 then raise exception 'Check inventory mode and recipe components';end if;
  for comp in select value from jsonb_array_elements(p_data->'components') loop
   select * into item from public.ingredients where shop_id=p_shop_id and id=(comp->>'ingredient_id')::uuid;
   if not found then raise exception 'Choose an existing inventory item';end if;
   quantity:=(comp->>'quantity')::numeric;
   if quantity is null or quantity<=0 or quantity>1000000 or quantity<>round(quantity,6) or (item.base_unit='each' and quantity<>trunc(quantity)) then raise exception 'Enter a positive component quantity in its base unit';end if;
   if item.id=any(ids) then raise exception 'Combine duplicate inventory components into one quantity';end if;ids:=array_append(ids,item.id);
   parts:=parts||jsonb_build_array(jsonb_build_object('ingredient_id',item.id,'name',item.name,'base_unit',item.base_unit,'quantity',quantity));
  end loop;
  select coalesce(max(version),0)+1 into next_version from public.pos_recipe_versions r where r.product_id=prod.id and r.size_id is not distinct from v_size_id;
  insert into public.pos_recipe_versions(shop_id,product_id,size_id,version,mode,components,created_by) values(p_shop_id,prod.id,v_size_id,next_version,mode,parts,auth.uid()) returning id into recipe_id;
  update public.pos_inventory_configs set draft_recipe_id=recipe_id,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 elsif action='activate' then
  if cfg.draft_recipe_id is null then raise exception 'Save a draft before activating inventory tracking';end if;
  info:=public.pos_recipe_info(cfg.draft_recipe_id);
  if jsonb_array_length(info->'components')=0 or info->>'cost_cents' is null then raise exception 'Recipe needs active inventory items with recorded costs before activation';end if;
  if info->>'mode'='finished_good' and exists(select 1 from jsonb_array_elements(info->'components') c join public.ingredients i on i.id=(c->>'ingredient_id')::uuid where i.item_type<>'finished_good') then raise exception 'Finished-good tracking can consume only finished-good inventory items';end if;
  update public.pos_inventory_configs set active_recipe_id=cfg.draft_recipe_id,draft_recipe_id=null,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 elsif action='deactivate' then
  update public.pos_inventory_configs set active_recipe_id=null,revision=revision+1 where shop_id=p_shop_id and product_id=prod.id and size_key=cfg.size_key;
 else raise exception 'Unknown recipe action';end if;
 perform public.record_business_audit(p_shop_id,'inventory.recipe.'||action,'pos_product',prod.id,p_data);
 return public.finish_business_operation(p_shop_id,op,jsonb_build_object('product_id',prod.id));
end $$;

create or replace function public.pos_inventory_return(p_shop_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op uuid:=(p_data->>'operation_id')::uuid; entry public.pos_sale_consumptions; qty numeric:=(p_data->>'quantity')::numeric;
 reason text:=trim(p_data->>'reason'); returned numeric; returned_cost bigint; value bigint; replay jsonb;
begin
 perform public.require_shop_permission(p_shop_id,'inventory','return');
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

create or replace function public.pos_inventory_read_stock(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_shop_permission(p_shop_id,'inventory','view');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select jsonb_build_object(
  'items',coalesce((
   select jsonb_agg(
    to_jsonb(i)||jsonb_build_object(
     'minimum_stock',i.minimum_stock::text,
     'quantity',coalesce(b.quantity,0)::text,
     'value_cents',coalesce(case when b.quantity=0 then 0 else b.value_cents end,case when b.ingredient_id is null then 0 end),
     'revision',coalesce(b.revision,0),
     'unit_cost_cents',case when b.quantity>0 then b.value_cents/b.quantity else i.estimated_unit_cost_cents end::text,
     'has_movements',exists(select 1 from public.stock_movements m where m.shop_id=i.shop_id and m.ingredient_id=i.id),
     'unit_locked',(
      exists(select 1 from public.stock_movements m where m.shop_id=i.shop_id and m.ingredient_id=i.id)
      or exists(select 1 from public.recipe_items r where r.ingredient_id=i.id)
      or exists(select 1 from public.pos_recipe_versions rv cross join lateral jsonb_array_elements(rv.components) c where rv.shop_id=i.shop_id and (c->>'ingredient_id')::uuid=i.id)
     )
    ) order by i.name
   )
   from public.ingredients i
   left join public.inventory_balances b on b.shop_id=i.shop_id and b.ingredient_id=i.id
   where i.shop_id=p_shop_id
  ),'[]'),
  'movements',coalesce((
   select jsonb_agg(row_data order by row_data->>'created_at' desc)
   from (
    select to_jsonb(m)||jsonb_build_object(
     'quantity_delta',m.quantity_delta::text,
     'previous_quantity',m.previous_quantity::text,
     'resulting_quantity',m.resulting_quantity::text,
     'name',i.name,
     'base_unit',i.base_unit,
     'occurred_on',coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date),
     'supplier',d.supplier,
     'reference',d.reference,
     'notes',d.notes,
     'purchase_unit',d.purchase_unit,
     'entered_quantity',d.entered_quantity::text
    ) row_data
    from public.stock_movements m
    join public.ingredients i on i.id=m.ingredient_id
    join public.shops s on s.id=m.shop_id
    left join public.pos_stock_documents d on d.id=m.source_id
    where m.shop_id=p_shop_id and coalesce(d.occurred_on,(m.created_at at time zone s.timezone)::date) between p_from and p_to
   ) history
  ),'[]')
 ) into result;
 return result;
end $$;

create or replace function public.pos_inventory_recipe_data(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_shop_permission(p_shop_id,'inventory','view');
 return jsonb_build_object('configs',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('product_name',p.name,'active',public.pos_recipe_info(c.active_recipe_id),'draft',public.pos_recipe_info(c.draft_recipe_id))) from public.pos_inventory_configs c join public.pos_products p on p.id=c.product_id where c.shop_id=p_shop_id),'[]'));
end $$;

create or replace function public.pos_sales(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
 perform public.require_shop_read(p_shop_id,'sales');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select timezone into zone from public.shops where id=p_shop_id;
 return coalesce((select jsonb_agg(to_jsonb(s)-'request' order by created_at desc) from public.pos_sales s where shop_id=p_shop_id and created_at>=p_from::timestamp at time zone zone and created_at<(p_to+1)::timestamp at time zone zone),'[]');
end $$;

create or replace function public.pos_expenses(p_shop_id uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.require_shop_read(p_shop_id,'expenses');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 return coalesce((select jsonb_agg(to_jsonb(e) order by spent_on desc,created_at desc) from public.pos_expenses e where shop_id=p_shop_id and spent_on between p_from and p_to),'[]');
end $$;

create or replace function public.pos_inventory_cost_credits(p_shop_id uuid,p_from date,p_to date) returns bigint language plpgsql stable security definer set search_path='' as $$
declare value bigint; zone text;
begin
 perform public.require_shop_read(p_shop_id,'sales');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year';end if;
 select timezone into strict zone from public.shops where id=p_shop_id;
 select coalesce(sum(cost_cents),0)::bigint into value from public.pos_inventory_returns where shop_id=p_shop_id and created_at>=(p_from::timestamp at time zone zone) and created_at<((p_to+1)::timestamp at time zone zone);
 return value;
end $$;

create or replace function public.pos_inventory_catalog(p_shop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.require_shop_read(p_shop_id,'catalog');
 select coalesce(jsonb_object_agg(product_id,variants),'{}') into result from (
  select product_id,jsonb_object_agg(
   case when size_key='' then 'regular' else size_key end,
   jsonb_build_object(
    'state',case when active_recipe_id is not null then 'active' when draft_recipe_id is not null then 'draft' else 'not_configured' end,
    'mode',coalesce(a->>'mode',d->>'mode'),
    'max_quantity',case when active_recipe_id is not null then a->'max_quantity' else null end
   )||case when (public.has_shop_permission(p_shop_id,'menu') or public.has_shop_permission(p_shop_id,'inventory')) then jsonb_build_object(
    'cost_cents',a->'cost_cents',
    'has_draft',(draft_recipe_id is not null),
    'components',case when active_recipe_id is not null then coalesce(a->'components','[]'::jsonb) else '[]'::jsonb end
   ) else '{}'::jsonb end
  ) variants
  from public.pos_inventory_configs c
  left join lateral(select public.pos_recipe_info(c.active_recipe_id) a,public.pos_recipe_info(c.draft_recipe_id) d) info on true
  where shop_id=p_shop_id group by product_id
 ) grouped;
 return result;
end $$;

create or replace function public.pos_can_manage_product_image(p_name text, p_delete boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare shop uuid; product uuid;
begin
 if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(jpg|png|webp)$' then return false;end if;
 if p_delete and exists(select 1 from public.pos_products where position('/storage/v1/object/public/product-images/'||p_name in image_url)>0) then return false;end if;
 shop:=split_part(p_name,'/',1)::uuid;product:=split_part(p_name,'/',2)::uuid;
 -- Storage setup remains compatible with installations awaiting the ACL upgrade.
 if to_regprocedure('public.has_shop_permission(uuid,text,text)') is null then return public.is_shop_founder(shop);end if;
 return public.has_shop_permission(shop,'menu',case when exists(select 1 from public.pos_products where shop_id=shop and id=product) then 'edit' else 'create' end);
end $$;
revoke all on function public.pos_can_manage_product_image(text,boolean) from public,anon;
grant execute on function public.pos_can_manage_product_image(text,boolean) to authenticated;

create or replace function public.reject_history_change() returns trigger
language plpgsql set search_path='' as $$
begin
 -- Allow PostgreSQL ON DELETE SET NULL on audit_logs.actor_id when an Auth user is deleted.
 if tg_table_name='audit_logs' and tg_op='UPDATE'
  and old.actor_id is not null and new.actor_id is null
  and not exists(select 1 from auth.users where id=old.actor_id)
  and (to_jsonb(new)-'actor_id')=(to_jsonb(old)-'actor_id') then
  return new;
 end if;
 raise exception 'Historical records are immutable; publish a new version or record a correction.' using errcode='55000';
end $$;
revoke all on function public.reject_history_change() from public,anon,authenticated;

alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs add constraint audit_logs_actor_id_fkey foreign key(actor_id) references auth.users(id) on delete set null;
alter table public.membership_invites drop constraint if exists membership_invites_accepted_by_fkey;
alter table public.membership_invites add constraint membership_invites_accepted_by_fkey foreign key(accepted_by) references auth.users(id) on delete set null;
alter table public.membership_invites drop constraint if exists membership_invites_created_by_fkey;
alter table public.membership_invites add constraint membership_invites_created_by_fkey foreign key(created_by) references auth.users(id) on delete cascade;

notify pgrst,'reload schema';
commit;
