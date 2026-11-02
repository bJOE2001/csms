import Link from "next/link";
import { money, object, text, type Row } from "@/lib/business/data";
import { getNextStep } from "@/lib/workspace/guidance";
import { Icon } from "@/components/ui/icon";
import { WorkspaceHeader } from "@/components/workspace-header";
import { SyncStatus } from "@/components/business/sync-status";
import { Reports } from "@/components/business/reports";

export function WorkspaceOverview({ shop, userId, role, summary, operationalData }: { shop: { id: string; name: string; setup_state: string }; userId: string; role: string; summary: Row; operationalData?: Row }) {
  const founder = role === "founder", next = getNextStep(summary, role);
  const sales = object(operationalData?.sales);
  const costsKnown = Number(sales.missing_cost_orders) === 0 && Number(sales.missing_return_costs ?? 0) === 0;
  const net = Number(sales.gross_cents) - Number(sales.discount_cents) - Number(sales.refund_cents);
  const financeMetrics = [
    ["Planned startup budget", money(summary.planned_budget_cents), "Your plan, separate from spending"],
    ["Approved actual spending", money(summary.actual_spending_cents), "Reviewed expenses recorded so far"],
    ["Confirmed founder funding", money(summary.confirmed_funding_cents), "Capital, loans and reimbursable funds"],
    ["Funding awaiting confirmation", money(summary.pending_funding_cents), "Pending review of funds received"],
  ];
  const metrics = operationalData ? [
    ["Gross sales", money(sales.gross_cents), "This month, before discounts and reversals"],
    ["Net sales", money(net), "After discounts and reversals"],
    ["Completed orders", text(sales, "completed_orders"), "Server-confirmed completed orders"],
    ["Gross profit", costsKnown ? money(net - Number(sales.known_cogs_cents) + Number(sales.returned_cost_cents)) : "Unavailable", costsKnown ? "Net sales less recorded stock costs" : "Review missing inventory costs"],
  ] : financeMetrics;
  const steps = [
    { title: "Prepare your menu", description: `${text(summary, "products")} products created`, href: "/app/menu", started: Number(summary.products) > 0 },
    { title: "Review recipes & availability", description: `${text(summary, "available_variants")} variants enabled for sale`, href: Number(summary.ingredients) ? "/app/menu" : "/app/recipes", started: Number(summary.available_variants) > 0 },
    { title: "Record actual opening stock", description: `${text(summary, "stock_entries")} ingredient balances recorded`, href: "/app/inventory", started: Number(summary.stock_entries) > 0 },
  ];
  const attention = [
    { title: "Payment confirmations", description: "Check wallet payments against funds received", count: Number(summary.pending_payments) || 0, href: "/app/orders", icon: "orders" },
    { title: "Founder funding", description: "Review contributions awaiting confirmation", count: Number(summary.pending_funding_cents) > 0 ? "Pending" : "None", href: "/app/funding", icon: "funding" },
    { title: "Cash reconciliation", description: "Review unresolved cashier shifts", count: Number(summary.unresolved_shifts) || 0, href: "/app/shifts", icon: "shifts" },
  ];
  return <main className="shell workspace-shell"><WorkspaceHeader active="dashboard" shopName={shop.name} role={role}/><div className="workspace-content" id="workspace-main" tabIndex={-1}>
    <div className="page-heading overview-heading"><div><p className="eyebrow">Your workspace, at a glance</p><h1>{shop.name}</h1><p className="hint">{shop.setup_state === "pre_opening" ? "Get ready for opening, one step at a time." : "A clear starting point for your daily work."}</p></div><span className="stage-label"><span className="status-dot"/>{shop.setup_state === "pre_opening" ? "Pre-opening" : "Daily operations"}</span></div>

    <div className="overview-layout"><section className="panel next-steps"><div className="section-heading"><h2>Your next steps</h2><span className="section-note">{founder ? "Opening & daily workflow" : "Your daily workflow"}</span></div><div className="recommended-step"><span className="recommendation-icon"><Icon name={next.icon} size={24}/></span><div><p className="eyebrow">Recommended next</p><h3>{next.title}</h3><p>{next.description}</p><Link className="button" href={next.href}>{next.action}<Icon name="arrow" size={16}/></Link></div></div>
      {founder && <div className="setup-steps" aria-label="Preparation checklist">{steps.map((step, index) => <Link href={step.href} className="setup-step" key={step.title}><span className={`step-number${step.started ? " recorded" : ""}`}>{step.started ? <Icon name="check" size={16}/> : index + 1}</span><span><strong>{step.title}</strong><small>{step.description}</small></span><span className="step-state">{step.started ? "Records added" : "To prepare"}</span><Icon name="arrow" size={16}/></Link>)}<Link href="/app/shifts" className="setup-step"><span className="step-number">4</span><span><strong>Set up your till & open a shift</strong><small>Register a device, count opening cash, then sell</small></span><Icon name="arrow" size={16}/></Link></div>}
    </section><aside className="overview-aside">{founder && <section className="panel attention-panel"><h2>Needs attention</h2><p className="hint">A quick review before you move on.</p>{attention.map(item => <Link href={item.href} className="attention-item" key={item.title}><Icon name={item.icon} size={18}/><span><strong>{item.title}</strong><small>{item.description}</small></span><span className={`attention-count${item.count === "Pending" || Number(item.count) > 0 ? " has-items" : ""}`}>{item.count}</span></Link>)}</section>}<section className="panel sync-panel"><div className="section-heading"><h2>This browser</h2><span className="status-dot"/></div><SyncStatus userId={userId} shopId={shop.id}/><Link className="inline-link" href="/pos">Open POS & review sync<Icon name="arrow" size={15}/></Link></section></aside></div>
    {founder && <><div className="section-caption">{operationalData ? "Sales overview · this month" : "Startup at a glance · all recorded history"}<Link href={operationalData ? "/app/reports" : "/app/budgets"}>{operationalData ? "View reports" : "View budget"}<Icon name="arrow" size={14}/></Link></div><div className="business-metrics overview-metrics">{metrics.map(([label, value, hint]) => <article className="panel" key={label}><p className="metric-label">{label}</p><p className="business-amount">{value}</p><p className="metric-note">{hint}</p></article>)}</div></>}
    <section className="panel workspace-shortcuts"><h2>Jump into your work</h2><div>{(founder ? [["purchases", "/app/purchases", "Plan or receive a purchase", "Suppliers, deliveries and purchase records"], ["expenses", "/app/expenses", "Record an expense", "Track real spending with a receipt"], ["menu", "/app/menu", "Manage your menu", "Products, sizes, selling prices and availability"], ["reports", "/app/reports", "Understand the numbers", "Sales, stock and financial reports"]] : [["pos", "/pos", "Take an order", "Open the point of sale"], ["orders", "/app/orders", "Find an order", "View saved receipts and payment status"]]).map(([icon, href, title, description]) => <Link href={href} key={href}><span className="shortcut-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrow" size={17}/></Link>)}</div></section>
    {operationalData && <section className="panel dashboard-reports"><h2>This month’s sales & stock details</h2><p className="hint">{text(summary, "orders")} server-confirmed orders recorded across all history. Use the full report for a different period.</p><details><summary>Show detailed sales, payments and inventory</summary><Reports data={operationalData} filterAction="/app/reports"/></details><details><summary>Show startup finance totals</summary><div className="business-metrics">{financeMetrics.map(([label,value,hint])=><article key={label}><p className="metric-label">{label}</p><p className="business-amount">{value}</p><p className="hint">{hint}</p></article>)}</div></details></section>}
  </div></main>;
}

