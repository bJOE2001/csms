-- Rename only the owner-identified shop. Its UUID, menu publication and related records remain intact.
update public.shops
set name = 'LOGO'
where id = 'd83551c0-49a7-4d4b-8e28-7d825a4885f5'
  and name is distinct from 'LOGO';

select id, name, public_menu_enabled
from public.shops
where id = 'd83551c0-49a7-4d4b-8e28-7d825a4885f5';
