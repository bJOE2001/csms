import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {WorkspaceOverview} from "@/components/workspace/overview";
import {object} from "@/lib/business/data";



export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: memberships, error } = await supabase.from("shop_members").select("role, status, shops(id, name, setup_state, timezone)").eq("user_id", user.id);
  const membership = memberships?.find((item) => item.status === "active") ?? memberships?.[0];
  const shopData = membership?.shops;
  const shop = Array.isArray(shopData) ? shopData[0] : shopData;
  const membershipPending = memberships?.some((membership) => membership.status === "invited") ?? false;
  const membershipSuspended = memberships?.some((membership) => membership.status === "suspended") ?? false;
  if(shop&&membership?.status==="active"){
    const founder=membership.role==="founder";
    const response=founder?await supabase.rpc("workspace_dashboard",{p_shop_id:shop.id}):null;
    if(response?.error)throw new Error("Dashboard could not be loaded. Apply pending migrations and refresh.");
    const summary=object(response?.data);
    const today=new Intl.DateTimeFormat("sv-SE",{timeZone:shop.timezone}).format(new Date());
    const operational=founder&&(shop.setup_state==="operating"||Number(summary.orders)>0)?await supabase.rpc("business_report",{p_shop_id:shop.id,p_start:today.slice(0,8)+"01",p_end:today}):null;
    if(operational?.error)throw new Error("Operational dashboard could not be loaded.");
    return <WorkspaceOverview shop={shop} userId={user.id} role={membership.role} summary={summary} operationalData={operational ? object(operational.data) : undefined}/>;
  }

  const description = error
    ? "Shop access could not be loaded. Refresh after your administrator checks the database connection."
    : shop
      ? "Prepare your menu, recipes, suppliers, and startup plans. Sales and inventory activity will appear only after real transactions are recorded."
      : membershipPending
        ? "Your shop membership is pending. Ask a founder to activate your account."
        : membershipSuspended
          ? "Your shop access is suspended. Ask a founder to review your membership."
          : "Your account is signed in, but it is not yet a member of a shop. Create your pre-opening business workspace to get started.";

  return (
    <main className="shell workspace-shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">◒</span>
          <span>COFFEE SHOP MANAGEMENT</span>
        </Link>
        <form action="/auth/sign-out" method="post">
          <button className="top-link" type="submit">Sign out</button>
        </form>
      </header>
      <section className="hero">
        <div>
          <div className="eyebrow">{shop?.setup_state === "operating" ? "SHOP WORKSPACE" : "PRE-OPENING"}</div>
          <h1>{shop?.name ?? "Your shop setup starts here."}</h1>
          <p className="hero-copy">{description}</p>
          <div className="actions">
            {shop && membership?.role === "founder" && <><Link className="button" href="/app/menu">Prepare menu</Link><Link className="button secondary" href="/app/recipes">Recipes &amp; costing</Link></>}
            {!shop && !membershipPending && !membershipSuspended && <Link className="button" href="/app/setup">Set up shop</Link>}
            <span className="status"><i className="status-dot" /> SALES HISTORY NOT STARTED</span>
          </div>
        </div>
        <aside className="preview">
          <div className="preview-head">
            <span className="preview-title">Opening readiness</span>
            <span className="status">SETUP</span>
          </div>
          <div className="metric">
            <div className="metric-label">Sales</div>
            <div className="metric-value">No history yet</div>
            <div className="metric-note">No sales have been recorded</div>
          </div>
          <div className="readiness">
            <strong>Planned and actual records stay distinct</strong>
            <p>Budget estimates and planned purchases do not count as expenses or inventory. Founder funding is kept separate from revenue.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}


