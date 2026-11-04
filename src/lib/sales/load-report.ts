import type { requireMember } from "@/lib/auth/require-member";
import type { Expense, Sale } from "./domain";

type Client = Awaited<ReturnType<typeof requireMember>>["supabase"];

/** Same readers and inclusive shop-date boundaries for Sales and Dashboard. */
export async function loadSalesReport(client: Client, shopId: string, from: string, to: string) {
  const params = { p_shop_id: shopId, p_from: from, p_to: to };
  const [sales, expenses] = await Promise.all([
    client.rpc("pos_sales", params),
    client.rpc("pos_expenses", params),
  ]);
  if (sales.error || expenses.error || !Array.isArray(sales.data) || !Array.isArray(expenses.data))
    throw new Error("Report unavailable");
  return { sales: sales.data as unknown as Sale[], expenses: expenses.data as unknown as Expense[] };
}
