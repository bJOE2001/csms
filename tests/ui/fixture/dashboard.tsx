import { useEffect, useState } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { NotificationProvider } from "@/components/ui/notification-provider";
import { buildDashboard, previousPeriod } from "@/lib/sales/dashboard";
import type { Sale, Expense } from "@/lib/sales/domain";
import { salesRange, shopDate } from "@/lib/sales/period";

// Test data only; the production Dashboard has no demo-data path.
export function DashboardFixture() {
  const [query, setQuery] = useState(location.search);
  useEffect(() => {
    const update = () => setQuery(location.search);
    window.addEventListener("fixture:navigate", update);
    window.addEventListener("popstate", update);
    return () => { window.removeEventListener("fixture:navigate", update); window.removeEventListener("popstate", update); };
  }, []);
  const params = new URLSearchParams(query);
  const { from, to } = salesRange(Object.fromEntries(params), "2026-11-02");
  const prior = previousPeriod(from, to);
  const defaultSales: Sale[] = Array.from({ length: 64 }, (_, i) => ({
    id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000001`,
    created_at: new Date(Date.UTC(2026, 9, 1 + i, 4)).toISOString(), total_cents: i % 2 ? 29000 : 11000,
    total_cost_cents: params.has("missing") && i === 32 ? null : i % 2 ? 10000 : 3000,
    method: i % 3 ? "cash" : "gcash", status: i % 13 === 0 ? "refunded" : "completed", payment_status: "confirmed",
    tendered_cents: 50000, refund_reason: null,
    items: [{ name: i % 2 ? "Café Latte" : "Americano", size_label: i % 2 ? "16 oz" : "12 oz", quantity: i % 2 ? 2 : 1, unit_price_cents: i % 2 ? 14500 : 11000, line_total_cents: i % 2 ? 29000 : 11000 }],
  }));
  defaultSales[32] = { ...defaultSales[32], total_cents: 14500, total_cost_cents: params.has("missing") ? null : 5000, items: [{ name: "Latte", quantity: 1, unit_price_cents: 14500, line_total_cents: 14500 }] };
  const expenseSource = sessionStorage.getItem("fixture-expenses");
  const expenses: Expense[] = params.has("empty") ? [] : expenseSource ? JSON.parse(expenseSource) : [{ id: "expense", spent_on: "2026-11-02", description: "Electricity", amount_cents: 2000, voided: false }];
  const source = sessionStorage.getItem("fixture-sales");
  const all: Sale[] = params.has("empty") ? [] : source ? JSON.parse(source) : defaultSales;
  const within = (sale: Sale, start: string, end: string) => { const day = shopDate("Asia/Manila", new Date(sale.created_at)); return day >= start && day <= end; };
  const error = sessionStorage.getItem("fixture:report-error") ?? undefined;
  return <NotificationProvider><WorkspaceShell active="dashboard" shopName="LOGO Coffee"><DashboardView
    shopId="00000000-0000-4000-8000-000000000001" shopName="LOGO Coffee" timezone="Asia/Manila"
    from={from} to={to} loadError={error}
    report={error ? null : buildDashboard(all.filter(sale => within(sale, from, to)), expenses.filter(expense => expense.spent_on >= from && expense.spent_on <= to), from, to, "Asia/Manila", all.filter(sale => within(sale, prior.from, prior.to)))}
  /></WorkspaceShell></NotificationProvider>;
}
