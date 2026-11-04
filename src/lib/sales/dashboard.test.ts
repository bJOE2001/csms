import { describe, expect, it } from "vitest";
import { buildDashboard, itemNetRevenue, previousPeriod } from "./dashboard";
import { summarize, type Sale, type Expense } from "./domain";

const makeSale = (patch: Partial<Sale> = {}): Sale => ({
  id: "sale", created_at: "2026-11-02T04:00:00Z", total_cents: 14500, total_cost_cents: 5000,
  method: "cash", status: "completed", payment_status: "confirmed", tendered_cents: 14500,
  refund_reason: null, items: [{ name: "Historical Latte", size_label: "Custom 16 oz", quantity: 1, unit_price_cents: 14500, line_total_cents: 14500 }], ...patch,
});
const expense: Expense = { id: "expense", spent_on: "2026-11-02", description: "Rent", amount_cents: 2000, voided: false };
const build = (sales: Sale[], expenses: Expense[] = [], previous: Sale[] | null = null) => buildDashboard(sales, expenses, "2026-11-02", "2026-11-02", "Asia/Manila", previous);

describe("Dashboard financial reporting", () => {
  it("reconciles exactly with Sales, including prepared refunds and voided expenses", () => {
    const sales = [makeSale(), makeSale({ id: "wallet", method: "gcash" }), makeSale({ id: "refund", status: "refunded" }), makeSale({ id: "cancel", status: "cancelled", total_cost_cents: null })];
    const expenses = [expense, { ...expense, id: "void", amount_cents: 99999, voided: true }];
    const report = build(sales, expenses);
    expect(report.summary).toEqual(summarize(sales, expenses));
    expect(report.summary).toMatchObject({ total: 29000, orders: 2, productCosts: 15000, operatingExpenses: 2000, grossProfit: 14000, netProfit: 12000, average: 14500, cash: 14500, wallet: 14500 });
    expect(report.reversed).toBe(2);
    expect(report.series.reduce((sum, point) => sum + point.cents, 0)).toBe(report.summary.total);
    expect(report.products).toEqual([{ name: "Historical Latte", quantity: 2, revenue: 29000 }]);
  });
  it("never represents missing historical costs as zero profit", () => {
    expect(build([makeSale({ total_cost_cents: null })]).summary).toMatchObject({ missingCosts: 1, grossProfit: null, netProfit: null, grossMargin: null, netMargin: null });
  });
  it("uses Manila midnight and hourly boundaries without UTC day shifts", () => {
    const report = build([makeSale({ created_at: "2026-11-01T16:00:00Z" }), makeSale({ created_at: "2026-11-02T15:59:59Z" })]);
    expect(report.series).toHaveLength(24);
    expect(report.series[0].cents).toBe(14500);
    expect(report.series[23].cents).toBe(14500);
    expect(report.series[0].label).toContain("Nov 2, 2026 · 00:00");
  });
  it("preserves custom snapshot sizes, unsized items, and quantity ranking", () => {
    const report = build([makeSale({ total_cents: 20000, items: [
      { name: "Archived product name", size_label: "Tall / Oat", quantity: 2, unit_price_cents: 5000, line_total_cents: 10000 },
      { name: "Unsized pastry", quantity: 5, unit_price_cents: 2000, line_total_cents: 10000 },
    ] })]);
    expect(report.products[0]).toMatchObject({ name: "Unsized pastry", quantity: 5 });
    expect(report.sizes.map(row => row.name)).toEqual(["No size recorded", "Tall / Oat"]);
  });
  it("allocates historical receipt discounts exactly, including indivisible cents", () => {
    const sale = makeSale({ total_cents: 100, items: ["A", "B", "C"].map(name => ({ name, quantity: 1, unit_price_cents: 50, line_total_cents: 50 })) });
    expect(itemNetRevenue(sale)).toEqual([34, 33, 33]);
    expect(build([sale]).products.reduce((sum, row) => sum + row.revenue, 0)).toBe(100);
  });
  it("calculates equivalent inclusive previous periods across leap years", () => {
    expect(previousPeriod("2024-03-01", "2024-03-03")).toEqual({ from: "2024-02-27", to: "2024-02-29" });
    expect(previousPeriod("2026-11-02", "2026-11-02")).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });
  it("omits unsupported and zero-denominator comparisons", () => {
    expect(build([makeSale()]).comparison).toBeNull();
    expect(build([makeSale()], [], []).comparison).toBeNull();
    expect(build([makeSale()], [], [makeSale({ total_cents: 0 })]).comparison).toBeNull();
    expect(build([makeSale()], [], [makeSale({ total_cents: 10000 })]).comparison?.percent).toBe(45);
    expect(build([], [], [makeSale()]).comparison?.percent).toBe(-100);
  });
  it("aggregates long ranges without losing revenue or inclusive end dates", () => {
    for (const [from, to, granularity] of [["2026-11-01", "2026-11-03", "Daily"], ["2026-10-01", "2026-11-30", "Weekly"], ["2026-01-01", "2026-11-03", "Monthly"]]) {
      const sale = makeSale({ created_at: `${to}T15:59:59Z` });
      const report = buildDashboard([sale], [], from, to, "Asia/Manila");
      expect(report.granularity).toBe(granularity);
      expect(report.series.reduce((sum, point) => sum + point.cents, 0)).toBe(14500);
    }
  });
  it("caps payload rankings and recent receipts without limiting financial totals", () => {
    const sales = Array.from({ length: 70 }, (_, i) => makeSale({ id: String(i), created_at: `2026-11-02T${String(i % 16).padStart(2, "0")}:00:00Z`, items: [{ name: `Product ${i}`, quantity: 1, unit_price_cents: 14500, line_total_cents: 14500 }] }));
    const report = build(sales);
    expect(report.recent).toHaveLength(5);
    expect(report.products).toHaveLength(5);
    expect(report.summary.total).toBe(70 * 14500);
    expect(report.summary.orders).toBe(70);
  });
  it("handles genuine empty data and rejects invalid ranges", () => {
    expect(build([]).summary).toMatchObject({ total: 0, netMargin: null, grossMargin: null });
    expect(build([]).products).toEqual([]);
    expect(() => buildDashboard([], [], "2026-11-03", "2026-11-02", "Asia/Manila")).toThrow("To Date");
  });
});
