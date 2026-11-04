import { requireMember } from "@/lib/auth/require-member";
import { shopDate, salesRange } from "@/lib/sales/period";
import type { Expense } from "@/lib/sales/domain";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ExpensesView } from "@/components/expenses-view";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "@/components/ui/workspace-skeleton";

export default async function ExpensesPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { supabase, shop, role } = await requireMember();
  const today = shopDate(shop.timezone);
  const { from, to } = salesRange(await searchParams, today);
  return <WorkspaceShell active="expenses" shopName={shop.name}>
    <Suspense fallback={<WorkspaceSkeleton module="expenses" />}>
      <ExpensesReport supabase={supabase} shop={shop} role={role} today={today} from={from} to={to} />
    </Suspense>
  </WorkspaceShell>;
}

async function ExpensesReport({ supabase, shop, role, today, from, to }: Pick<Awaited<ReturnType<typeof requireMember>>, "supabase" | "shop" | "role"> & { today: string; from: string; to: string }) {
  let expenses: Expense[] = [], loadError: string | undefined;
  try {
    const { data, error } = await supabase.rpc("pos_expenses", {
      p_shop_id: shop.id, p_from: from, p_to: to,
    });
    if (error) throw Error();
    expenses = data as unknown as Expense[];
  } catch {
    loadError = "Expenses could not be updated. Your previous results are still shown if available. Check your connection and choose a date again to retry.";
  }
  return <ExpensesView expenses={expenses} loadError={loadError} shopId={shop.id}
    founder={role === "founder"} today={today} from={from} to={to} />;
}
