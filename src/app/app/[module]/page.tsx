import { notFound,redirect } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { object,rows,text } from "@/lib/business/data";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Inventory,Purchases } from "@/components/business/inventory";
import { Finance } from "@/components/business/finance";
import { Shifts } from "@/components/business/shifts";
import { Settings,Staff } from "@/components/business/settings";
import { Orders } from "@/components/business/orders";
import { Reports } from "@/components/business/reports";
import { PageAction, PageGuide } from "@/components/workspace/page-guide";

const titles:Record<string,string>={inventory:"Ingredient inventory",purchases:"Purchases & suppliers",budgets:"Startup budget",expenses:"Expenses",funding:"Founder funding",shifts:"Cashier shifts",settings:"Business settings",staff:"Staff & permissions",orders:"Orders & receipts",reports:"Business reports",audit:"Audit trail"};
export default async function BusinessPage({params,searchParams}:{params:Promise<{module:string}>;searchParams:Promise<{page?:string;start?:string;end?:string}>}) {
  const {module}=await params; if(!Object.hasOwn(titles,module))notFound();
  const {supabase,shop,role}=await requireMember();if(role!=="founder"&&!["orders","shifts"].includes(module))redirect("/app");
  const query=await searchParams;const page=Math.max(0,Math.min(10000,Number.parseInt(query.page??"0",10)||0));
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:shop.timezone}).format(new Date());
  let data;
  if(module==="reports"){
    const response=await supabase.rpc("business_report",{p_shop_id:shop.id,p_start:query.start??today.slice(0,8)+"01",p_end:query.end??today});
    if(response.error)throw new Error("Report could not be loaded. Check dates and applied migrations.");data=object(response.data);
  }else{
    const response=await supabase.rpc("get_business_data",{p_shop_id:shop.id,p_module:module,p_page:page});
    if(response.error)throw new Error("Business records could not be loaded. Apply pending migrations and refresh.");data=object(response.data);
  }
  return <main className="shell workspace-shell"><WorkspaceHeader active={module} shopName={shop.name} role={role}/><div className="workspace-content" id="workspace-main" tabIndex={-1}><div className="page-heading"><div><p className="eyebrow">{shop.setup_state==="pre_opening"?"Pre-opening preparation":"Daily operations"}</p><h1>{titles[module]}</h1></div><PageAction module={module}/>{module==="reports"&&<a className="button secondary" href={`/api/export?start=${encodeURIComponent(query.start??today.slice(0,8)+"01")}&end=${encodeURIComponent(query.end??today)}`}>Export report CSV</a>}</div>
    <PageGuide module={module} role={role}/>{module==="inventory"&&<Inventory data={data}/>}{module==="purchases"&&<Purchases data={data}/>}{["budgets","expenses","funding"].includes(module)&&<Finance data={data} module={module as "budgets"|"expenses"|"funding"} today={today}/>}{module==="shifts"&&<Shifts data={data}/>}{module==="settings"&&<Settings data={data} shop={shop}/>}{module==="staff"&&<Staff data={data}/>}{module==="orders"&&<Orders data={data} timezone={shop.timezone}/>}{module==="reports"&&<Reports data={data}/>}
    {module==="audit"&&<section><p className="hint">Append-only activity history. Newest records first.</p>{rows(data.audit_logs).map(r=><article className="ledger-row" key={text(r,"id")}><strong>{text(r,"action")}</strong><p>{text(r,"created_at")} · Actor {text(r,"actor_id")||"Database administrator"}</p><details><summary>Recorded context</summary><pre className="audit-context">{JSON.stringify(r.context,null,2)}</pre></details></article>)}</section>}
    {module!=="reports"&&<nav className="pagination" aria-label="Record pages">{page>0&&<Link href={`/app/${module}?page=${page-1}`}>← Newer records</Link>}<span>Page {page+1}</span><Link href={`/app/${module}?page=${page+1}`}>Older records →</Link></nav>}
  </div></main>;
}



