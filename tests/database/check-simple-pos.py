"""Disposable PostgreSQL integration test. Never connects to hosted Supabase."""
from pathlib import Path
import subprocess, tempfile, sys
root=Path(__file__).resolve().parents[2]
pg=Path(sys.argv[1] if len(sys.argv)>1 else r"C:/Program Files/PostgreSQL/17/bin")
base=root/".local";base.mkdir(exist_ok=True)
cluster=Path(tempfile.mkdtemp(prefix="simple-pos-db-",dir=base)).resolve()
assert cluster.is_relative_to(base.resolve())
def run(name,*args,input=None):
 if name=="pg_ctl":
  with (cluster/"control.log").open("a") as output:
   r=subprocess.run([str(pg/(name+".exe")),*args],stdout=output,stderr=output)
  if r.returncode:raise RuntimeError((cluster/"control.log").read_text())
  return ""
 r=subprocess.run([str(pg/(name+".exe")),*args],input=input,text=True,encoding="utf-8",capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr+r.stdout)
 return r.stdout
def sql(text):return run("psql","-h","127.0.0.1","-p","55439","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1",input=text)
started=False
try:
 run("initdb","-D",str(cluster),"-U","postgres","-A","trust","--encoding=UTF8")
 run("pg_ctl","-D",str(cluster),"-l",str(cluster/"server.log"),"-o","-h 127.0.0.1 -p 55439","-w","start");started=True
 sql("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;")
 for migration in sorted((root/"supabase/migrations").glob("*.sql")):
  if migration.name=="202611020001_simple_pos.sql":sql((root/"tests/database/pre-upgrade.sql").read_text(encoding="utf-8"))
  sql(migration.read_text(encoding="utf-8"))
 sql("do $$begin assert (select total_cents from public.pos_sales where id='00000000-0000-4000-8000-000000000098')=12000;assert (select items->0->>'name' from public.pos_sales where id='00000000-0000-4000-8000-000000000098')='Original latte · Regular';assert (select count(*) from public.pos_products where name='Original latte')=1;end $$;")
 print(sql((root/"tests/database/simple-pos.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/profit.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/record-cost.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/menu.sql").read_text(encoding="utf-8")))
 print(sql((root/"tests/database/expenses-management.sql").read_text(encoding="utf-8")))
 print("All migrations and simple POS database assertions passed.")
finally:
 if started:run("pg_ctl","-D",str(cluster),"-m","fast","-w","stop")
 # Preserve this unique, stopped test cluster for inspection. Never delete another cluster.
