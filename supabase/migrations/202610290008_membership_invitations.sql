-- The MVP has no multi-shop selector; all membership entry points share this
-- invariant, including concurrent invitations and administrator assignments.
create unique index one_shop_membership_per_account on public.shop_members(user_id);
create table public.membership_invites (
  id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(id),email text not null check(length(email)<=254),
  role public.shop_member_role not null,token uuid not null unique default gen_random_uuid(),status text not null default 'pending' check(status in('pending','accepted','revoked')),
  expires_at timestamptz not null default now()+interval '7 days',created_by uuid not null references auth.users(id),accepted_by uuid references auth.users(id),created_at timestamptz not null default now()
);
alter table public.membership_invites enable row level security;
revoke all on public.membership_invites from public,anon,authenticated;
grant select on public.membership_invites to authenticated;
create policy "Founders read invitations" on public.membership_invites for select to authenticated using(public.is_shop_founder(shop_id));
create function public.create_membership_invite(p_shop_id uuid,p_email text,p_role public.shop_member_role) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_token uuid;begin
  perform public.require_business_access(p_shop_id);
  if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  select token into v_token from public.membership_invites where shop_id=p_shop_id and email=lower(trim(p_email)) and role=p_role and status='pending' and expires_at>now() order by created_at desc limit 1;
  if v_token is null then
    insert into public.membership_invites(shop_id,email,role,created_by) values(p_shop_id,lower(trim(p_email)),p_role,auth.uid()) returning token into v_token;
    perform public.record_business_audit(p_shop_id,'membership.invited','invitation',v_token,jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
  end if;return v_token;
end $$;
create function public.accept_membership_invite(p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_invite public.membership_invites%rowtype;v_email text;begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  select * into strict v_invite from public.membership_invites where token=p_token;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_invite.shop_id::text,4));
  select * into strict v_invite from public.membership_invites where token=p_token for update;
  select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if v_invite.status='accepted' and v_invite.accepted_by=auth.uid() then return v_invite.shop_id; end if;
  if v_email is null or v_email<>v_invite.email or v_invite.status<>'pending' or v_invite.expires_at<now() then raise exception 'Invitation is invalid, expired, or belongs to another verified email' using errcode='42501'; end if;
  if exists(select 1 from public.shop_members where user_id=auth.uid()) then raise exception 'Account already has a shop membership'; end if;
  insert into public.shop_members(shop_id,user_id,role,status) values(v_invite.shop_id,auth.uid(),v_invite.role,'active');
  update public.membership_invites set status='accepted',accepted_by=auth.uid() where id=v_invite.id;
  perform public.record_business_audit(v_invite.shop_id,'membership.invitation_accepted','member',auth.uid(),jsonb_build_object('invitation_id',v_invite.id));
  return v_invite.shop_id;
end $$;
create function public.revoke_membership_invite(p_shop_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$begin
  perform public.require_business_access(p_shop_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text,4));
  perform public.require_business_access(p_shop_id);
  update public.membership_invites set status='revoked' where shop_id=p_shop_id and id=p_id and status='pending';
  if not found then raise exception 'Pending invitation not found'; end if;
  perform public.record_business_audit(p_shop_id,'membership.invitation_revoked','invitation',p_id,'{}');
end $$;
revoke all on function public.create_membership_invite(uuid,text,public.shop_member_role),public.accept_membership_invite(uuid),public.revoke_membership_invite(uuid,uuid) from public,anon;
grant execute on function public.create_membership_invite(uuid,text,public.shop_member_role),public.accept_membership_invite(uuid),public.revoke_membership_invite(uuid,uuid) to authenticated;
