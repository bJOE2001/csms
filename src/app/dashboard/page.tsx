import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";
import { loadSalesReport } from "@/lib/sales/load-report";
import { buildDashboard, previousPeriod } from "@/lib/sales/dashboard";
import { dateRangeError, salesRange, shopDate } from "@/lib/sales/period";
import type { Sale } from "@/lib/sales/domain";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceSkeleton } from "@/components/ui/workspace-skeleton";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const member = await requireMember();
  // Business analytics follow the established founder-only business access policy.
  if (member.role !== "founder") redirect("/pos");
  const { from, to } = salesRange(await searchParams, shopDate(member.shop.timezone));
  return <WorkspaceShell active="dashboard" shopName={member.shop.name}>
    <Suspense fallback={<WorkspaceSkeleton module="dashboard" />}>
      <DashboardReport member={member} from={from} to={to} />
    </Suspense>
  </WorkspaceShell>;
}

async function DashboardReport({ member: { supabase, shop }, from, to }: {
  member: Awaited<ReturnType<typeof requireMember>>; from: string; to: string;
}) {
  let report: ReturnType<typeof buildDashboard> | null = null;
  let loadError: string | undefined;
  try {
    const invalid = dateRangeError(from, to);
    if (invalid) throw new Error(invalid);
    const prior = previousPeriod(from, to);
    const [current, previous] = await Promise.all([
      loadSalesReport(supabase, shop.id, from, to),
      // A comparison failure must not discard a valid current report.
      supabase.rpc("pos_sales", { p_shop_id: shop.id, p_from: prior.from, p_to: prior.to })
        .then(({ data, error }) => !error && Array.isArray(data) ? data as unknown as Sale[] : null, () => null),
    ]);
    report = buildDashboard(current.sales, current.expenses, from, to, shop.timezone, previous);
  } catch {
    loadError = "Dashboard could not be updated. Previous results remain shown if available. Check your connection and choose a date again to retry.";
  }
  return <DashboardView report={report} shopId={shop.id} shopName={shop.name} timezone={shop.timezone} from={from} to={to} loadError={loadError} />;
}
