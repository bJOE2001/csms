-- Postconditions roll back the entire reset if any protected data changed.
do $$declare row record; actual text; target uuid:=(select shop_id from logo_reset_scope);
begin
 for row in select * from logo_reset_preserved loop
  if row.name like 'other:%' then
   execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,E''\n'' order by to_jsonb(t)::text),'''')) from public.%I t where shop_id<>$1',substr(row.name,7)) into actual using target;
  else
   -- Use the same stable serialization ordering as the preflight snapshot.
   if row.name='auth.users' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from auth.users t;
   elsif row.name='shops' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from public.shops t;
   elsif row.name='shop_members' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.id),'')) into actual from public.shop_members t;
   elsif row.name='profiles' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.user_id),'')) into actual from public.profiles t;
   elsif row.name='business_settings' then select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by t.shop_id),'')) into actual from public.business_settings t;end if;
  end if;
  if actual is distinct from row.digest then raise exception 'Protected data changed: %. Reset rolled back.',row.name;end if;
 end loop;
 if exists(select 1 from logo_reset_trigger_state s join pg_class c on c.relname=s.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname='public' join pg_trigger t on t.tgrelid=c.oid and t.tgname=s.trigger_name where t.tgenabled<>s.enabled) then raise exception 'Trigger restoration failed. Reset rolled back.';end if;
end $$;
select shop_id,backup_id,
 (select count(*) from public.pos_products where shop_id=s.shop_id) products,
 (select count(*) from public.ingredients where shop_id=s.shop_id) stock_items,
 (select count(*) from public.pos_inventory_configs where shop_id=s.shop_id and active_recipe_id is not null) active_recipes,
 (select count(*) from public.pos_sales where shop_id=s.shop_id) sales,
 (select count(*) from public.pos_expenses where shop_id=s.shop_id) expenses
from logo_reset_scope s;
commit;
