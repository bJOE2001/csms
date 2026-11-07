import { loadSalesReport } from "@/lib/sales/load-report";
import { requireMember } from "@/lib/auth/require-member";
import { WorkspaceShell } from "@/components/workspace-shell";
import { SalesView } from "@/components/sales-view";
import type { Sale, Expense } from "@/lib/sales/domain";
import { shopDate, salesRange } from "@/lib/sales/period";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/ui/workspace-skeleton";
import { visitDetails } from "@/lib/site/config";
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const { supabase, shop, role } = await requireMember();
  const params = await searchParams;
  const today = shopDate(shop.timezone);
  const { from, to } = salesRange(params, today);
  return <WorkspaceShell active="sales" shopName={shop.name}>
    <Suspense fallback={<WorkspaceSkeleton module="sales" />}>
      <SalesReport supabase={supabase} shop={shop} role={role} from={from} to={to} />
    </Suspense>
  </WorkspaceShell>;
}

async function SalesReport({ supabase, shop, role, from, to }: Pick<Awaited<ReturnType<typeof requireMember>>, "supabase" | "shop" | "role"> & { from: string; to: string }) {
  const { address, phone } = visitDetails();
  let sales: Sale[] = [], expenses: Expense[] = [], loadError: string | undefined;
  let stockReturnCredits = 0;
  try {
    ({ sales, expenses, stockReturnCredits } = await loadSalesReport(supabase, shop.id, from, to));
  } catch {
    loadError = "Sales could not be updated. Your previous results are still shown if available. Check your connection and choose a date again to retry.";
  }
  return (
    <SalesView
      sales={sales}
      expenses={expenses}
      stockReturnCredits={stockReturnCredits}
      loadError={loadError}
      shopId={shop.id}
      shopName={shop.name}
      founder={role === "founder"}
      timezone={shop.timezone}
      from={from}
      to={to}
      business={{ address, phone }}
    />
  );
}
