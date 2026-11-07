"""Build the SQL Editor artifact from the tested integrated fixture definitions."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=(root/'supabase/seeds/integrated_development.sql').read_text(encoding='utf-8')
source=source[source.index('create or replace function pg_temp.dev_id'):]
source=source.replace("md5('logo-integrated-v1:'||label)","md5('logo-integrated-v1:'||current_setting('logo.reset_shop')||':'||label)")
source=source.replace('language sql immutable', 'language sql stable')
source=source.replace('-- Only the guarded local superuser tool may suspend history triggers for this explicit reset.', '-- Temporarily suspend application history guards for this explicit business reset; retain foreign-key checks.')
start=source.index(" if nullif(current_setting('logo.reset_shop'")
end=source.index(' select created_by into strict owner_id',start)
source=source[:start]+" shop:=current_setting('logo.reset_shop')::uuid;\n"+source[end:]
source=source.replace(' select created_by into strict owner_id from public.shops where id=shop;'," select user_id into strict owner_id from public.shop_members where shop_id=shop and role='founder' and status='active' order by created_at limit 1;")
source=source.replace("'order_items','orders','purchase_receipts'","'order_items','orders','pos_sessions','expenses','purchase_receipts'")
source=source.replace("'cashier_shifts','expenses','founder_contributions'","'cashier_shifts','founder_contributions'")
source=source.replace("'recipe_items','recipes','order_consumptions'", "'order_consumptions'")
source=source.replace("'pos_categories','product_prices'", "'pos_categories','recipe_items','recipes','product_prices'")
source=source.replace(" perform set_config('session_replication_role','replica',true);"," perform pg_temp.logo_reset_triggers(false,true);")
source=source.replace(" perform set_config('session_replication_role','origin',true);"," perform pg_temp.logo_reset_triggers(true,true);")
source=source.replace('perform pg_temp.logo_reset_triggers(false,true);','perform pg_temp.logo_reset_triggers(false,false);',1)
source=source.replace('perform pg_temp.logo_reset_triggers(true,true);','perform pg_temp.logo_reset_triggers(true,false);',1)
header=(root/'supabase/seeds/hosted_reset_header.sql').read_text(encoding='utf-8')
footer=(root/'supabase/seeds/hosted_reset_footer.sql').read_text(encoding='utf-8')
assert 'session_replication_role' not in source
(root/'supabase/seeds/hosted_development_reset.sql').write_text(header+'\n'+source+'\n'+footer,encoding='utf-8')
print('Built supabase/seeds/hosted_development_reset.sql')
