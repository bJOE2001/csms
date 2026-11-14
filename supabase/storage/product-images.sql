-- Run once in Supabase SQL Editor after the application migrations. No product
-- tables or records change. Storage remains separate from runtime public assets.
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from storage.buckets where id='product-images' and public
    and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']
    and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
    raise exception 'Review the existing product-images bucket settings before enabling uploads';
  end if;
end $$;

-- Check references across shops, including archived products. RLS on a direct
-- subquery would otherwise hide another shop's reference to this public image.
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

drop policy if exists pos_product_images_read on storage.objects;
create policy pos_product_images_read on storage.objects for select to authenticated
  using (bucket_id='product-images' and public.pos_can_manage_product_image(name));
drop policy if exists pos_product_images_insert on storage.objects;
create policy pos_product_images_insert on storage.objects for insert to authenticated
  with check (bucket_id='product-images' and public.pos_can_manage_product_image(name));
drop policy if exists pos_product_images_delete on storage.objects;
create policy pos_product_images_delete on storage.objects for delete to authenticated
  using (bucket_id='product-images' and public.pos_can_manage_product_image(name,true));
-- No UPDATE policy: uploads use new UUID keys and never overwrite old images.
commit;
