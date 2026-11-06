-- Run after 202611060001_public_menu.sql in Supabase SQL Editor.
-- Exactly one shop is selected automatically. For multiple shops, uncomment and set the target first:
-- select set_config('coffee_pos.public_menu_shop_id','YOUR-EXISTING-SHOP-UUID',false);
begin;
do $$
declare
  target_shop uuid := nullif(current_setting('coffee_pos.public_menu_shop_id',true),'')::uuid;
  shop_count bigint;
begin
  if target_shop is null then
    select count(*), min(s.id::text)::uuid into shop_count, target_shop from public.shops s;
    if shop_count <> 1 then
      raise exception 'Choose the shop with coffee_pos.public_menu_shop_id before publishing its catalog';
    end if;
  end if;
  update public.shops set public_menu_enabled=true where id=target_shop;
  if not found then raise exception 'The selected shop does not exist'; end if;
end;
$$;
commit;
select id,name,public_menu_enabled from public.shops where public_menu_enabled order by name,id;
