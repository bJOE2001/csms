import { requireMember } from "@/lib/auth/require-member";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SalesView } from "@/components/sales-view";
import type { Sale, Expense } from "@/lib/sales/domain";
import { shopDate, salesRange } from "@/lib/sales/period";
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const { supabase, shop, role } = await requireMember();
  const params = await searchParams;
  const today = shopDate(shop.timezone);
  const { from, to } = salesRange(params, today);
  const { data, error } = await supabase.rpc("pos_sales", {
    p_shop_id: shop.id,
    p_from: from,
    p_to: to,
  });
  const { data: expenses, error: expenseError } = await supabase.rpc(
    "pos_expenses",
    { p_shop_id: shop.id, p_from: from, p_to: to },
  );
  if (error || expenseError)
    throw new Error(
      "Sales could not be loaded. Check the date range and apply the POS profit migration.",
    );
  return (
    <WorkspaceShell active="sales" shopName={shop.name}>
      <SalesView
        sales={data as unknown as Sale[]}
        expenses={expenses as unknown as Expense[]}
        shopId={shop.id}
        shopName={shop.name}
        founder={role === "founder"}
        timezone={shop.timezone}
        from={from}
        to={to}
      />
    </WorkspaceShell>
  );
}
