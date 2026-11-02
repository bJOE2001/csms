export type WorkspacePage = { id: string; href: string; label: string; description: string; keywords: string; founder?: boolean };
export const workspaceGroups: { label: string; pages: WorkspacePage[] }[] = [
  { label: "Daily workspace", pages: [
    { id: "dashboard", href: "/app", label: "Overview", description: "See your next steps and what needs attention.", keywords: "dashboard home start readiness" },
    { id: "pos", href: "/pos", label: "Point of sale", description: "Take an order and record a customer payment.", keywords: "sell checkout cashier offline" },
    { id: "orders", href: "/app/orders", label: "Orders & receipts", description: "Find a sale, confirm a payment or print a receipt.", keywords: "refund cancel wallet gcash sales" },
    { id: "shifts", href: "/app/shifts", label: "Cashier shifts", description: "Open a shift and reconcile the cash drawer.", keywords: "opening closing cash movement register device" },
  ] },
  { label: "Menu & stock", pages: [
    { id: "menu", href: "/app/menu", label: "Products & menu", description: "Organize products, sizes, prices and availability.", keywords: "category drink pastry variant add on", founder: true },
    { id: "recipes", href: "/app/recipes", label: "Recipes & costing", description: "Set up ingredients and what goes into each serving.", keywords: "ingredient unit cost recipe estimate", founder: true },
    { id: "inventory", href: "/app/inventory", label: "Ingredient inventory", description: "Review stock, record a physical count or log wastage.", keywords: "opening stock count adjustment balance loss", founder: true },
    { id: "purchases", href: "/app/purchases", label: "Purchases & suppliers", description: "Plan a purchase and receive ingredients from a supplier.", keywords: "supplier contact delivery stock order receive", founder: true },
  ] },
  { label: "Money & insights", pages: [
    { id: "expenses", href: "/app/expenses", label: "Expenses", description: "Record actual spending and review supporting receipts.", keywords: "payment spending cost approve reimbursement", founder: true },
    { id: "funding", href: "/app/funding", label: "Founder funding", description: "Track founder capital, loans and reimbursable funding.", keywords: "contribution investment money confirm", founder: true },
    { id: "budgets", href: "/app/budgets", label: "Startup budget", description: "Plan opening costs separately from actual spending.", keywords: "budget planned forecast equipment opening", founder: true },
    { id: "reports", href: "/app/reports", label: "Business reports", description: "Review sales, profit estimates, payments and stock.", keywords: "report export csv gross cogs performance", founder: true },
  ] },
  { label: "Administration", pages: [
    { id: "staff", href: "/app/staff", label: "Staff & permissions", description: "Invite people and manage access to your shop.", keywords: "member team invite email founder role", founder: true },
    { id: "settings", href: "/app/settings", label: "Business settings", description: "Set up your shop, receipts, payment methods and devices.", keywords: "hours timezone name discount offline device", founder: true },
    { id: "audit", href: "/app/audit", label: "Audit trail", description: "Review who changed records and when it happened.", keywords: "history log activity actor audit", founder: true },
  ] },
];
export function findWorkspacePages(query: string, role: string): WorkspacePage[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return workspaceGroups.flatMap(group => group.pages).filter(page => {
    if (page.founder && role !== "founder") return false;
    const content = `${page.label} ${page.description} ${page.keywords}`.toLowerCase();
    return terms.every(term => content.includes(term));
  });
}
