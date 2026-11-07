"""Explicit reset of a dedicated, workspace-local PostgreSQL development database.

Never reads .env or connects to hosted Supabase. Auth identities and shop settings
are retained on repeat runs. Business records are replaced in one transaction.
"""
from pathlib import Path
import argparse, json, os, subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--confirm-local-business-reset', action='store_true')
args = parser.parse_args()
if not args.confirm_local_business_reset or os.environ.get('NODE_ENV') == 'production':
    raise SystemExit('Requires --confirm-local-business-reset outside production.')
root = Path(__file__).resolve().parents[1]
cluster = (root / '.local/logo-development').resolve()
if not cluster.is_relative_to((root / '.local').resolve()):
    raise SystemExit('Invalid development data directory.')
pg = Path(os.environ.get('LOGO_POSTGRES_BIN', r'C:/Program Files/PostgreSQL/17/bin'))
cluster.parent.mkdir(exist_ok=True)
def run(tool, *params, text=None):
    result = subprocess.run([str(pg / (tool + '.exe')), *params], input=text, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout
def sql(text):
    return run('psql','-h','127.0.0.1','-p','55440','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At',text=text)
fresh = not (cluster / 'PG_VERSION').exists()
if fresh:
    run('initdb','-D',str(cluster),'-U','postgres','-A','trust','--encoding=UTF8')
started = False
try:
    # Verify exclusive ownership before starting; an occupied port fails instead of changing targets.
    with (cluster / 'control.log').open('a') as log:
        subprocess.run([str(pg/'pg_ctl.exe'),'-D',str(cluster),'-l',str(cluster/'server.log'),'-o','-h 127.0.0.1 -p 55440','-w','start'], stdout=log,stderr=log,check=True)
    started = True
    actual = Path(sql('show data_directory').strip()).resolve()
    if actual != cluster: raise RuntimeError('Target database is not the dedicated disposable cluster.')
    if fresh:
        sql("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create table public.logo_local_migrations(name text primary key);")
    for file in sorted((root/'supabase/migrations').glob('*.sql')):
        if sql("select count(*) from public.logo_local_migrations where name='"+file.name+"'").strip() == '0':
            sql(file.read_text(encoding='utf-8')+"\ninsert into public.logo_local_migrations values('"+file.name+"');")
    owner='00000000-0000-4000-8000-000000007001'
    sql("insert into auth.users(id,email) values('"+owner+"','owner@logo.local.invalid') on conflict do nothing;")
    shop=sql("select set_config('request.jwt.claim.sub','"+owner+"',false);select coalesce((select shop_id from public.shop_members where user_id='"+owner+"' and role='founder' limit 1),public.create_shop('LOGO','Asia/Manila'));").strip().splitlines()[-1]
    seed=(root/'supabase/seeds/integrated_development.sql').read_text(encoding='utf-8')
    checks=(root/'tests/database/recipe-only.sql').read_text(encoding='utf-8')
    sql("begin;select set_config('logo.disposable_local','confirmed',true);select set_config('logo.reset_shop','"+shop+"',true);"+seed+checks+"commit;")
    print(json.dumps({'cluster':str(cluster),'shop_id':shop,'sales':229,'status':'Local business reset and integrated data verified; hosted data untouched.'}))
finally:
    if started:
        with (cluster/'control.log').open('a') as log:
            subprocess.run([str(pg/'pg_ctl.exe'),'-D',str(cluster),'-m','fast','-w','stop'],stdout=log,stderr=log,check=True)
