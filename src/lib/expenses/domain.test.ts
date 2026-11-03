import { describe, expect, it } from "vitest";
import { summarizeExpenses } from "./domain";
import { summarize, type Expense } from "@/lib/sales/domain";

const expense: Expense = {
  id: "00000000-0000-4000-8000-000000000001",
  spent_on: "2026-11-03", description: "Rent", amount_cents: 10001, voided: false,
};
describe("expense reporting uses the same records as Sales", () => {
  it("excludes voided amounts from total, largest and average while retaining record counts", () => {
    const records = [expense, { ...expense, id: "second", amount_cents: 20000 }, { ...expense, id: "voided", amount_cents: 50000, voided: true }];
    expect(summarizeExpenses(records)).toEqual({ total: 30001, records: 3, voided: 1, largest: 20000, average: 15001 });
    expect(summarize([], records).operatingExpenses).toBe(30001);
    expect(summarize([], records).netProfit).toBe(-30001);
  });
  it("keeps Sales in agreement after create, edit and soft deletion", () => {
    for (const records of [[], [expense], [{ ...expense, amount_cents: 12345 }], [{ ...expense, voided: true }]]) {
      expect(summarizeExpenses(records).total).toBe(summarize([], records).operatingExpenses);
      expect(summarize([], records).netProfit).toBe(0 - summarizeExpenses(records).total);
    }
  });
  it("handles empty and entirely voided reports without invented averages", () => {
    expect(summarizeExpenses([])).toEqual({ total: 0, records: 0, voided: 0, largest: 0, average: 0 });
    expect(summarizeExpenses([{ ...expense, voided: true }])).toEqual({ total: 0, records: 1, voided: 1, largest: 0, average: 0 });
  });
});
