import { z } from "zod";
export { productSchema } from "../menu/domain";
export type { Product } from "../menu/domain";
export const checkoutSchema = z
  .object({
    id: z.uuid(),
    method: z.enum(["cash", "gcash"]),
    tendered_cents: z.number().int().min(0).max(100000000000).optional(),
    items: z
      .array(
        z
          .object({
            product_id: z.uuid(),
            size_id: z.uuid().optional(),
            size_label: z.string().trim().min(1).max(60).optional(),
            quantity: z.number().int().min(1).max(100),
            price_cents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(
        (items) =>
          new Set(items.map((i) => `${i.product_id}:${i.size_id ?? ""}`))
            .size === items.length,
        "Duplicate product and size",
      ),
  })
  .strict();
export type Checkout = z.infer<typeof checkoutSchema>;
export type Sale = {
  id: string;
  created_at: string;
  total_cents: number;
  total_cost_cents?: number | null;
  cost_recorded_at?: string | null;
  cost_recorded_by?: string | null;
  cost_note?: string | null;
  method: string;
  status: string;
  tendered_cents: number | null;
  refund_reason: string | null;
  payment_status: string;
  items: {
    name: string;
    size_label?: string | null;
    size_id?: string | null;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
  }[];
};
export function cents(value: string): number {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a valid PHP amount with up to two decimals.");
  const [whole, decimal = ""] = value.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(value / 100);
}
export const expenseSchema = z.object({
  id: z.uuid(),
  spent_on: z.iso.date(),
  description: z.string().trim().min(1).max(200),
  amount_cents: z.number().int().min(1).max(100000000),
});
export const recordCostSchema = z.object({
  id: z.uuid(),
  cost_cents: z.number().int().min(0).max(1000000000000),
  note: z.string().trim().min(1).max(500),
});
export type Expense = z.infer<typeof expenseSchema> & { voided: boolean };
export function summarize(sales: Sale[], expenses: Expense[] = []) {
  const completed = sales.filter((s) => s.status === "completed");
  const total = completed.reduce((sum, s) => sum + s.total_cents, 0);
  // Prepared goods still cost money when payment is refunded.
  const costedSales = sales.filter(
    (s) => s.status === "completed" || s.status === "refunded",
  );
  const missingCosts = costedSales.filter(
    (s) => s.total_cost_cents == null,
  ).length;
  const productCosts = costedSales.reduce(
    (sum, s) => sum + (s.total_cost_cents ?? 0),
    0,
  );
  const operatingExpenses = expenses
    .filter((e) => !e.voided)
    .reduce((sum, e) => sum + e.amount_cents, 0);
  const grossProfit = missingCosts ? null : total - productCosts;
  const netProfit =
    grossProfit === null ? null : grossProfit - operatingExpenses;
  return {
    productCosts,
    missingCosts,
    operatingExpenses,
    grossProfit,
    netProfit,
    grossMargin:
      grossProfit === null || total === 0 ? null : (grossProfit / total) * 100,
    netMargin:
      netProfit === null || total === 0 ? null : (netProfit / total) * 100,
    total,
    orders: completed.length,
    average: completed.length ? Math.round(total / completed.length) : 0,
    cash: completed
      .filter((s) => s.method === "cash")
      .reduce((n, s) => n + s.total_cents, 0),
    wallet: completed
      .filter((s) => s.method !== "cash")
      .reduce((n, s) => n + s.total_cents, 0),
  };
}
