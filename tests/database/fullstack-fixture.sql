\set ON_ERROR_STOP on
-- TEST ONLY, called inside the runner's disposable database.
insert into auth.users(id,email,email_confirmed_at) values('50000000-0000-4000-8000-000000000001','browser-founder@example.test',now());
set request.jwt.claim.sub='50000000-0000-4000-8000-000000000001';
select public.create_shop('Browser integration fixture') as browser_shop \gset
select set_config('csms.seed_shop_id',:'browser_shop',false);
\ir ../../supabase/seed.sql
