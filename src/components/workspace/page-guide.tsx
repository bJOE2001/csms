import Link from "next/link";
import { Icon } from "@/components/ui/icon";

const guides: Record<string, { title: string; description: string; links: [string, string][] }> = {
  menu: { title: "Build your menu, then make it sellable", description: "Add a category and product, publish its recipe, then enable the variant for the POS.", links: [["/app/recipes", "Set up recipes"]] },
  recipes: { title: "Ingredients → recipe → available menu item", description: "Add ingredients in their base units. Choose a product variant, enter its recipe and publish. Then enable it in Products & menu.", links: [["/app/menu", "Enable menu items"]] },
  inventory: { title: "Keep recorded stock in step with your shelves", description: "Use opening stock for your first count. Receive deliveries in Purchases. Use physical counts and wastage for later changes.", links: [["/app/purchases", "Receive a delivery"], ["/app/recipes", "Manage ingredients"]] },
  purchases: { title: "Plan a purchase → place the order → receive stock", description: "Add a supplier first. A planned or ordered purchase changes no stock; record a delivery only when ingredients arrive.", links: [["/app/inventory", "View stock"], ["/app/expenses", "Record payment"]] },
  budgets: { title: "Plan what opening will cost", description: "Budgets are your spending plan. Record money actually spent in Expenses so plans and actuals stay separate.", links: [["/app/expenses", "View actual spending"]] },
  expenses: { title: "Record spending, then review it", description: "Add the amount, purpose and receipt. Pending records affect approved spending only after review. Choose the correct expense classification.", links: [["/app/budgets", "View startup budget"]] },
  funding: { title: "Keep founder funding separate from sales", description: "Record a contribution, loan or reimbursable payment, then confirm it after checking the funds received.", links: [["/app/budgets", "View spending plan"]] },
  shifts: { title: "Open your till before taking the first order", description: "Choose a registered device and count the opening cash. Use the POS during the shift, then sync every order and count closing cash.", links: [["/pos", "Go to POS"], ["/app/settings", "Manage POS devices"]] },
  orders: { title: "Find a receipt or review a payment", description: "Server-confirmed orders appear here. Pending wallet payments need confirmation. Corrections preserve the original sale and its audit history.", links: [["/pos", "Take an order"]] },
  reports: { title: "Choose a period to understand your business", description: "Sales, money received and founder funding are shown separately. Missing stock costs keep profit estimates unavailable until reviewed.", links: [["/app/orders", "Review payments"], ["/app/expenses", "Review expenses"]] },
  settings: { title: "Set up the shop behind your daily work", description: "Update business and receipt details here. Register your POS device before opening a cashier shift.", links: [["/app/shifts", "Open a shift"]] },
  staff: { title: "Give each person the access they need", description: "Invite staff by email. Founder access includes financial records and settings; staff access covers the POS, orders and assigned shifts.", links: [] },
  audit: { title: "A permanent history of important changes", description: "Open a record to see its details. This history is read-only; correct a transaction from its original module.", links: [] },
};
const primaryActions: Record<string, [string, string]> = {
  menu: ["Add a product", "#create-product"], recipes: ["Publish a recipe", "#publish-recipe"],
  inventory: ["Update stock", "#stock-actions"], purchases: ["New purchase", "#purchase-create"],
  budgets: ["Add budget item", "#finance-create"], expenses: ["Record an expense", "#finance-create"], funding: ["Record funding", "#finance-create"],
  shifts: ["Open a shift", "#shift-open"], settings: ["Set up a device", "#device-setup"], staff: ["Invite someone", "#invite-staff"], orders: ["Take an order", "/pos"],
};
export function PageAction({ module }: { module: string }) {
  const action = primaryActions[module];
  return action ? <Link className="button" href={action[1]}>{action[0]}<Icon name="arrow" size={16}/></Link> : null;
}
export function PageGuide({ module, role = "founder" }: { module: string; role?: string }) {
  const guide = guides[module];
  if (!guide) return null;
  return <aside className="workflow-guide" aria-label="How this page works"><span className="guide-icon"><Icon name={module} size={21} /></span><div><strong>{guide.title}</strong><p>{guide.description}</p></div>{guide.links.length > 0 && <div className="guide-links">{guide.links.filter(([href]) => role === "founder" || ["/pos", "/app/orders", "/app/shifts"].includes(href)).map(([href, label]) => <Link key={href} href={href}>{label}<Icon name="arrow" size={15} /></Link>)}</div>}</aside>;
}
