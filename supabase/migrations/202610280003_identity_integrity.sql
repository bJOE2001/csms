-- Serialize first-shop creation per account so concurrent requests cannot create two shops.
create index shop_members_user_status_idx on public.shop_members(user_id, status);
create or replace function public.create_shop(shop_name text, shop_timezone text default 'Asia/Manila')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop_id uuid; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if exists (select 1 from public.shop_members where user_id = v_user_id) then raise exception 'This account already belongs to a shop'; end if;
  if shop_name is null or length(trim(shop_name)) not between 1 and 120 then raise exception 'Shop name must be 1 to 120 characters'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = trim(shop_timezone)) then raise exception 'Invalid timezone'; end if;
  insert into public.shops(name, timezone, created_by) values (trim(shop_name), trim(shop_timezone), v_user_id) returning id into v_shop_id;
  insert into public.shop_members(shop_id, user_id, role) values (v_shop_id, v_user_id, 'founder');
  return v_shop_id;
end;
$$;

create function public.validate_shop_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then raise exception 'Invalid timezone'; end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.created_by is distinct from old.created_by
      or new.created_at is distinct from old.created_at or new.currency_code is distinct from old.currency_code then
      raise exception 'Shop identity and original creation details cannot be changed';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.validate_shop_record() from public, anon, authenticated;
create trigger validate_shop_before_write before insert or update on public.shops for each row execute function public.validate_shop_record();

create function public.audit_identity_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_shop_id uuid; v_entity_id uuid; v_context jsonb;
begin
  if tg_table_name = 'shops' then
    v_shop_id := new.id; v_entity_id := new.id;
    v_context := jsonb_build_object('name', new.name, 'timezone', new.timezone, 'setup_state', new.setup_state);
    if tg_op = 'UPDATE' then v_context := v_context || jsonb_build_object('before', jsonb_build_object('name', old.name, 'timezone', old.timezone, 'setup_state', old.setup_state)); end if;
  elsif tg_table_name = 'shop_members' then
    if tg_op = 'DELETE' then
      v_shop_id := old.shop_id; v_entity_id := old.id;
      v_context := jsonb_build_object('user_id', old.user_id, 'role', old.role, 'status', old.status);
    else
      v_shop_id := new.shop_id; v_entity_id := new.id;
      v_context := jsonb_build_object('user_id', new.user_id, 'role', new.role, 'status', new.status);
      if tg_op = 'UPDATE' then v_context := v_context || jsonb_build_object('before', jsonb_build_object('role', old.role, 'status', old.status)); end if;
    end if;
  else
    v_shop_id := new.shop_id; v_entity_id := new.id;
    v_context := jsonb_build_object('name', new.name, 'enabled', new.enabled, 'offline_capable', new.offline_capable);
    if tg_op = 'UPDATE' then v_context := v_context || jsonb_build_object('before', jsonb_build_object('name', old.name, 'enabled', old.enabled, 'offline_capable', old.offline_capable)); end if;
  end if;
  insert into public.audit_logs(shop_id, actor_id, action, entity_type, entity_id, context)
    values (v_shop_id, auth.uid(), lower(tg_table_name || '.' || tg_op), tg_table_name, v_entity_id, v_context);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_identity_change() from public, anon, authenticated;
create trigger audit_shop_changes after insert or update on public.shops for each row execute function public.audit_identity_change();
create trigger audit_membership_changes after insert or update or delete on public.shop_members for each row execute function public.audit_identity_change();
create trigger audit_device_changes after insert or update on public.pos_devices for each row execute function public.audit_identity_change();
revoke delete on public.pos_devices from authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 120))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
