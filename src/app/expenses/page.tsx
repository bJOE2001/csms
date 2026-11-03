import { requireMember } from "@/lib/auth/require-member";
import { shopDate, salesRange } from "@/lib/sales/period";
import type { Expense } from "@/lib/sales/domain";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ExpensesView } from "@/components/expenses-view";

export default async function ExpensesPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { supabase, shop, role } = await requireMember();
  const today = shopDate(shop.timezone);
  const { from, to } = salesRange(await searchParams, today);
  const { data, error } = await supabase.rpc("pos_expenses", {
    p_shop_id: shop.id, p_from: from, p_to: to,
  });
  if (error) throw Error("Expenses could not be loaded. Check the date range and database migrations.");
  return <WorkspaceShell active="expenses" shopName={shop.name}>
    <ExpensesView expenses={data as unknown as Expense[]} shopId={shop.id}
      founder={role === "founder"} today={today} from={from} to={to} />
  </WorkspaceShell>;
}
