"""Verify the SQL Editor reset against disposable PostgreSQL, never a remote DB."""
from pathlib import Path
import json
import subprocess
import tempfile
import re

root = Path(__file__).resolve().parents[2]
pg = Path(r'C:/Program Files/PostgreSQL/17/bin')
base = root / '.local'
base.mkdir(exist_ok=True)
cluster = Path(tempfile.mkdtemp(prefix='hosted-reset-test-', dir=base)).resolve()
assert cluster.is_relative_to(base.resolve())


def run(name, *args, input=None):
    if name == 'pg_ctl':
        with (cluster / 'control.log').open('a') as log:
            result = subprocess.run([str(pg / (name + '.exe')), *args], stdout=log, stderr=log)
        if result.returncode:
            raise RuntimeError((cluster / 'control.log').read_text(encoding='utf-8'))
        return ''
    result = subprocess.run([str(pg / (name + '.exe')), *args], input=input,
                            text=True, encoding='utf-8', capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)
    return result.stdout


def sql(text, user='postgres'):
    return run('psql', '-h', '127.0.0.1', '-p', '55441', '-U', user, '-d', 'postgres',
               '-v', 'ON_ERROR_STOP=1', '-At', input=text)


def expect_failure(text, message):
    try:
        sql(text, 'editor')
    except RuntimeError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError('Expected failure: ' + message)


started = False
try:
    run('initdb', '-D', str(cluster), '-U', 'postgres', '-A', 'trust', '--encoding=UTF8')
    run('pg_ctl', '-D', str(cluster), '-l', str(cluster / 'server.log'), '-o',
        '-h 127.0.0.1 -p 55441', '-w', 'start')
    started = True
    sql("""create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;""")
    for migration in sorted((root / 'supabase/migrations').glob('*.sql')):
        sql(migration.read_text(encoding='utf-8'))
    # A non-superuser table-owner member approximates SQL Editor ownership without
    # relying on superuser-only replication/FK bypasses.
    sql("create role editor login nosuperuser; grant postgres to editor; grant usage on schema auth to editor; grant select on auth.users to editor;")
    assert sql("select rolsuper from pg_roles where rolname='editor'").strip() == 'f'
    owner = '00000000-0000-4000-8000-000000007011'
    sql(f"insert into auth.users(id,email) values('{owner}','reset-test@logo.invalid');")
    shop = sql(f"select set_config('request.jwt.claim.sub','{owner}',false); select public.create_shop('Reset test','Asia/Manila');").strip().splitlines()[-1]
    artifact = (root / 'supabase/seeds/hosted_development_reset.sql').read_text(encoding='utf-8')
    assert 'session_replication_role' not in artifact
    cleanup = re.search(r'unnest\(array\[(.*?)\]\)', artifact).group(1)
    tables = re.findall(r"'([^']+)'", cleanup)
    edges = json.loads(sql("select coalesce(jsonb_agg(jsonb_build_array(c.relname,p.relname)),'[]') from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_class p on p.oid=f.confrelid where f.contype='f';").strip())
    for child, parent in edges:
        if child in tables and parent in tables and child != parent:
            assert tables.index(child) < tables.index(parent), f'Unsafe FK cleanup order: {child} -> {parent}'
    print(sql(artifact, 'editor'))
    first = sql(f"select jsonb_agg(id order by id) from public.pos_sales where shop_id='{shop}';").strip()
    # Two resets on the same SQL session also exercise reusable pg_temp helpers.
    print(sql(artifact + artifact, 'editor'))
    assert first == sql(f"select jsonb_agg(id order by id) from public.pos_sales where shop_id='{shop}';").strip()
    assert sql('select count(*) from logo_dev_reset.backups;').strip() == '3'
    assert sql('select count(*) from auth.users;').strip() == '1'
    assert sql('select count(*) from public.shop_members;').strip() == '1'
    assert sql("select has_table_privilege('anon','logo_dev_reset.backups','select') or has_table_privilege('authenticated','logo_dev_reset.backups','select');").strip() == 'f'
    other_owner = '00000000-0000-4000-8000-000000007012'
    sql(f"insert into auth.users(id,email) values('{other_owner}','other-shop@logo.invalid'); select set_config('request.jwt.claim.sub','{other_owner}',false); select public.create_shop('Other shop','Asia/Manila');")
    expect_failure(artifact, 'Found 2 shops')
    target_artifact = artifact.replace("'logo.hosted_target_shop',''", f"'logo.hosted_target_shop','{shop}'")
    print(sql(target_artifact, 'editor'))
    assert sql('select count(*) from logo_dev_reset.backups;').strip() == '4'
    assert sql('select count(*) from auth.users;').strip() == '2'
    # A late failure must roll back deletes, backup creation and trigger suspension.
    before = sql('select md5(jsonb_agg(to_jsonb(s) order by id)::text) from public.pos_sales s;').strip()
    broken = target_artifact.replace('-- Postconditions roll back', "do $$begin raise exception 'Deliberate rollback probe';end $$;\n-- Postconditions roll back")
    expect_failure(broken, 'Deliberate rollback probe')
    assert before == sql('select md5(jsonb_agg(to_jsonb(s) order by id)::text) from public.pos_sales s;').strip()
    assert sql('select count(*) from logo_dev_reset.backups;').strip() == '4'
    print(json.dumps({'status': 'passed', 'cases': ['non-superuser owner', 'full fixture', 'repeat reset', 'backup privacy', 'account preservation', 'ambiguous shop rejected', 'other shop preserved', 'atomic rollback'], 'cluster': str(cluster)}))
finally:
    if started:
        run('pg_ctl', '-D', str(cluster), '-m', 'fast', '-w', 'stop')
