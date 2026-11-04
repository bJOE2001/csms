-- Runs only in the disposable cluster. Never connects to hosted Storage.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000aa0101','image-owner@test.invalid'),
 ('00000000-0000-4000-8000-000000aa0102','image-other@test.invalid'),
 ('00000000-0000-4000-8000-000000aa0103','image-staff@test.invalid');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0101',false);
select set_config('test.image_shop',public.create_shop('Image shop','Asia/Manila')::text,false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0102',false);
select set_config('test.other_image_shop',public.create_shop('Other image shop','Asia/Manila')::text,false);
insert into public.shop_members(shop_id,user_id,role,status) values
 (current_setting('test.image_shop')::uuid,'00000000-0000-4000-8000-000000aa0103','staff','active');
select set_config('test.image_key',current_setting('test.image_shop')||'/00000000-0000-4000-8000-000000aa0201/00000000-0000-4000-8000-000000aa0301.png',false);
select set_config('test.shared_image_key',current_setting('test.image_shop')||'/00000000-0000-4000-8000-000000aa0201/00000000-0000-4000-8000-000000aa0302.png',false);
create function pg_temp.image_expect_denied(command text) returns void language plpgsql as $$
begin
  begin execute command; exception when insufficient_privilege then return; end;
  raise exception 'Expected access denial: %',command;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0101',false);
do $$begin
  assert public.pos_can_manage_product_image(current_setting('test.image_key'));
  assert not public.pos_can_manage_product_image('../../file.png');
  assert not public.pos_can_manage_product_image(current_setting('test.other_image_shop')||'/00000000-0000-4000-8000-000000aa0201/00000000-0000-4000-8000-000000aa0301.png');
end $$;
insert into storage.objects(bucket_id,name) values('product-images',current_setting('test.image_key'));
delete from storage.objects where name=current_setting('test.image_key');
do $$begin assert not exists(select 1 from storage.objects);end $$;
insert into storage.objects(bucket_id,name) values
 ('product-images',current_setting('test.image_key')),('product-images',current_setting('test.shared_image_key'));
select public.pos_save_product(current_setting('test.image_shop')::uuid,jsonb_build_object(
 'id','00000000-0000-4000-8000-000000aa0201','name','Image product','price_cents',10000,'cost_cents',3000,'active',true,
 'image_url','https://project.supabase.co/storage/v1/object/public/product-images/'||current_setting('test.image_key')));
delete from storage.objects where name=current_setting('test.image_key');
do $$begin assert exists(select 1 from storage.objects where name=current_setting('test.image_key'));end $$;
select public.pos_archive_product(current_setting('test.image_shop')::uuid,'00000000-0000-4000-8000-000000aa0201');
delete from storage.objects where name=current_setting('test.image_key');
do $$begin assert exists(select 1 from storage.objects where name=current_setting('test.image_key'));end $$;

-- A public image referenced only in another shop must still be retained.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0102',false);
select public.pos_save_product(current_setting('test.other_image_shop')::uuid,jsonb_build_object(
 'id','00000000-0000-4000-8000-000000aa0202','name','Shared image','price_cents',10000,'cost_cents',3000,'active',true,
 'image_url','https://project.supabase.co/storage/v1/object/public/product-images/'||current_setting('test.shared_image_key')));
select pg_temp.image_expect_denied(format('insert into storage.objects(bucket_id,name) values(%L,%L)','product-images',current_setting('test.image_key')));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0101',false);
delete from storage.objects where name=current_setting('test.shared_image_key');
do $$begin assert exists(select 1 from storage.objects where name=current_setting('test.shared_image_key'));end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000aa0103',false);
do $$begin
  assert not public.pos_can_manage_product_image(current_setting('test.image_key'));
  assert not exists(select 1 from storage.objects);
end $$;
select pg_temp.image_expect_denied(format('insert into storage.objects(bucket_id,name) values(%L,%L)','product-images',current_setting('test.image_key')));
delete from storage.objects;
reset role;
do $$begin assert (select count(*) from storage.objects)=2;end $$;
select 'Product image ownership, path isolation, cleanup and archived/cross-shop retention passed.';
