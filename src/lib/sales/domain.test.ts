import { describe, it, expect } from "vitest";
import { cents, checkoutSchema, paymentMethodLabel, summarize, type Sale } from "./domain";
describe("simple sales", () => {
  it("labels existing wallet records without changing their stored identifiers", () => {
    expect(paymentMethodLabel("gcash")).toBe("E-wallet");
    expect(paymentMethodLabel("cash")).toBe("Cash");
    expect(paymentMethodLabel("unknown")).toBe("Not recorded");
    expect(paymentMethodLabel("bank_transfer")).toBe("bank_transfer");
  });
  it("uses exact centavos and rejects fractional centavos", () => {
    expect(cents("145.01")).toBe(14501);
    expect(() => cents("1.001")).toThrow();
    expect(() => cents("-1")).toThrow();
  });
  it("excludes reversals from revenue and average", () => {
    const base = {
      id: "x",
      created_at: "",
      method: "cash",
      items: [],
      tendered_cents: null,
      refund_reason: null,
      payment_status: "confirmed",
    };
    const sales: Sale[] = [
      { ...base, total_cents: 10000, status: "completed" },
      { ...base, total_cents: 5000, status: "refunded" },
      { ...base, total_cents: 20000, status: "completed", method: "gcash" },
    ];
    expect(summarize(sales)).toMatchObject({
      total: 30000,
      orders: 2,
      refunds: 1,
      average: 15000,
      cash: 10000,
      wallet: 20000,
    });
    expect(summarize([]).average).toBe(0);
    expect(summarize([]).refunds).toBe(0);
    expect(summarize([{ ...sales[0], status: "cancelled" }]).refunds).toBe(0);
    expect(summarize(sales).netProfit).toBeNull();
  });
  it("deducts snapshot costs, retained refund costs and active expenses, including losses", () => {
    const base = {
      id: "x",
      created_at: "",
      method: "cash",
      items: [],
      tendered_cents: null,
      refund_reason: null,
      payment_status: "confirmed",
    };
    const sales: Sale[] = [
      {
        ...base,
        total_cents: 20000,
        total_cost_cents: 7000,
        status: "completed",
      },
      {
        ...base,
        total_cents: 10000,
        total_cost_cents: 3000,
        status: "refunded",
      },
      { ...base, total_cents: 5000, status: "cancelled" },
    ];
    const expense = {
      id: "e",
      spent_on: "2026-11-02",
      description: "Rent",
      amount_cents: 12000,
      voided: false,
    };
    expect(
      summarize(sales, [expense, { ...expense, voided: true }]),
    ).toMatchObject({
      total: 20000,
      productCosts: 10000,
      grossProfit: 10000,
      operatingExpenses: 12000,
      netProfit: -2000,
      missingCosts: 0,
      grossMargin: 50,
      netMargin: -10,
    });
    expect(
      summarize([
        { ...base, total_cents: 100, total_cost_cents: 0, status: "completed" },
      ]).netProfit,
    ).toBe(100);
    expect(
      summarize([{ ...base, total_cents: 100, status: "refunded" }]).netProfit,
    ).toBeNull();
    expect(summarize([], [expense]).netProfit).toBe(-12000);
    expect(summarize([], [expense]).netMargin).toBeNull();
    expect(summarize([]).grossMargin).toBeNull();
    expect(
      summarize([{ ...base, total_cents: 10000, status: "completed" }])
        .grossMargin,
    ).toBeNull();
    expect(
      summarize([
        {
          ...base,
          total_cents: 10000,
          total_cost_cents: 8000,
          status: "completed",
        },
      ]).netMargin,
    ).toBe(20);
  });
  it("rejects duplicate products and fractional quantities", () => {
    const id = "00000000-0000-4000-8000-000000000001",
      line = { product_id: id, quantity: 1, price_cents: 100 };
    expect(
      checkoutSchema.safeParse({ id, method: "cash", items: [line, line] })
        .success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({
        id,
        method: "cash",
        items: [{ ...line, quantity: 1.5 }],
      }).success,
    ).toBe(false);
  });
  it("preserves optional offline capture times and rejects ambiguous dates", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const sale = { id, method: "cash", items: [{ product_id: id, quantity: 1, price_cents: 100 }] };
    expect(checkoutSchema.parse(sale)).toEqual(sale);
    for (const captured_at of ["2026-11-12T08:30:00.000Z", "2026-11-12T16:30:00+08:00"])
      expect(checkoutSchema.parse({ ...sale, captured_at }).captured_at).toBe(captured_at);
    for (const captured_at of ["2026-11-12", "2026-11-12T08:30:00", "2026-02-30T08:30:00Z", "tomorrow", null])
      expect(checkoutSchema.safeParse({ ...sale, captured_at }).success).toBe(false);
  });
});
