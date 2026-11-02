create type public.shop_setup_state as enum ('pre_opening', 'operating');
create type public.shop_member_role as enum ('founder', 'staff');
create type public.shop_member_status as enum ('active', 'invited', 'suspended');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  currency_code text not null default 'PHP' check (currency_code = 'PHP'),
  timezone text not null default 'Asia/Manila',
  setup_state public.shop_setup_state not null default 'pre_opening',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.shop_member_role not null,
  status public.shop_member_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create table public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  offline_capable boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_enabled_offline_device_per_shop
  on public.pos_devices(shop_id) where offline_capable and enabled;

create or replace function public.is_shop_member(target_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = target_shop_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.is_shop_founder(target_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = target_shop_id and m.user_id = (select auth.uid())
      and m.role = 'founder' and m.status = 'active'
  );
$$;

revoke all on function public.is_shop_member(uuid) from public;
revoke all on function public.is_shop_founder(uuid) from public;
grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.is_shop_founder(uuid) to authenticated;

create or replace function public.create_shop(shop_name text, shop_timezone text default 'Asia/Manila')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_shop_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(trim(shop_name)) not between 1 and 120 then raise exception 'Shop name must be 1 to 120 characters'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = trim(shop_timezone)) then
    raise exception 'Invalid timezone';
  end if;
  if exists (select 1 from public.shop_members where user_id = current_user_id) then
    raise exception 'This account already belongs to a shop';
  end if;

  insert into public.shops (name, timezone, created_by)
  values (trim(shop_name), trim(shop_timezone), current_user_id)
  returning id into new_shop_id;

  insert into public.shop_members (shop_id, user_id, role, status)
  values (new_shop_id, current_user_id, 'founder', 'active');
  return new_shop_id;
end;
$$;
revoke all on function public.create_shop(text, text) from public;
grant execute on function public.create_shop(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.pos_devices enable row level security;

revoke all on public.profiles, public.shops, public.shop_members, public.pos_devices from public, anon;

create policy "Users read own profile" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users update own profile" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Members read their shops" on public.shops for select to authenticated
  using (public.is_shop_member(id));
create policy "Founders update their shops" on public.shops for update to authenticated
  using (public.is_shop_founder(id)) with check (public.is_shop_founder(id));

create policy "Members read shop membership" on public.shop_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_shop_founder(shop_id));

create policy "Members read POS devices" on public.pos_devices for select to authenticated
  using (public.is_shop_member(shop_id));
create policy "Founders manage POS devices" on public.pos_devices for all to authenticated
  using (public.is_shop_founder(shop_id)) with check (public.is_shop_founder(shop_id));

grant select, update on public.profiles to authenticated;
grant select, update on public.shops to authenticated;
grant select on public.shop_members to authenticated;
grant select, insert, update, delete on public.pos_devices to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'name'), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
