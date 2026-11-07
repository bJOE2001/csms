import { expect, it } from "vitest";
import {
  canSetOpeningStock,
  decimal,
  displayQuantity,
  formatUnitCost,
  itemSchema,
  preciseMoney,
  scaled,
  signedQuantity,
  stockStatus,
  type InventoryItem,
} from "./domain";
import { summarize } from "../sales/domain";
import { summarizeExpenses } from "../expenses/domain";

it("preserves six-decimal quantities exactly including large balances", () => {
  expect(decimal(scaled("999999999999.999999"))).toBe("999999999999.999999");
  expect(decimal(scaled("2") * 1000n)).toBe("2000");
  expect(displayQuantity("2000.125", "g")).toBe("2,000.125 g");
  expect(displayQuantity("150", "each")).toBe("150 pcs");
  expect(displayQuantity("-0.000001", "ml")).toBe("-0.000001 mL");
  expect(signedQuantity("2000", "g")).toBe("+2,000 g");
  expect(signedQuantity("-100", "g")).toBe("-100 g");
  expect(() => scaled("1.0000001")).toThrow();
});

it("displays unit and component costs with two decimals while preserving precise calculation formatting", () => {
  expect(preciseMoney("66.666666666666", 6)).toBe("₱0.666667");
  expect(preciseMoney("0", 6)).toBe("₱0.000000");
  expect(formatUnitCost("4500")).toBe("₱45.00");
  expect(formatUnitCost("50")).toBe("₱0.50");
  expect(formatUnitCost("0.3")).toBe("₱0.00");
  expect(formatUnitCost("66.666666666666")).toBe("₱0.67");
  expect(formatUnitCost("0.00001")).toBe("₱0.00");
  expect(formatUnitCost("60.8283")).toBe("₱0.61");
  expect(formatUnitCost("1094.9101")).toBe("₱10.95");
  expect(formatUnitCost("1000.499999")).toBe("₱10.00");
  expect(formatUnitCost("1000.5")).toBe("₱10.01");
  expect(formatUnitCost("0")).toBe("₱0.00");
  expect(formatUnitCost(null)).toBe("Not recorded");
  expect(formatUnitCost(undefined)).toBe("Not recorded");
  expect(formatUnitCost("invalid")).toBe("Not recorded");
});

it("keeps inactive, out-of-stock, low-stock and in-stock states distinct", () => {
  const item = { active: true, quantity: "0", minimum_stock: "10", revision: 0 } as InventoryItem;
  expect(stockStatus(item)).toBe("Out of Stock");
  expect(stockStatus({ ...item, quantity: "10" })).toBe("Low Stock");
  expect(stockStatus({ ...item, quantity: "10.000001" })).toBe("In Stock");
  expect(stockStatus({ ...item, active: false })).toBe("Inactive");
  expect(canSetOpeningStock(item)).toBe(true);
  expect(canSetOpeningStock({ ...item, has_movements: true })).toBe(false);
  expect(canSetOpeningStock({ ...item, revision: 1 })).toBe(false);
});

it("requires valid units, quantities and deliberate item configuration", () => {
  const item = { id: crypto.randomUUID(), name: "Owner item", item_type: "ingredient", base_unit: "g", minimum_stock: "0", notes: "", active: true };
  expect(itemSchema.safeParse(item).success).toBe(true);
  expect(itemSchema.safeParse({ ...item, base_unit: "kg" }).success).toBe(false);
  expect(itemSchema.safeParse({ ...item, name: "" }).success).toBe(false);
});

it("excludes explicitly classified purchases and applies dated return credits without rewriting sale costs", () => {
  const expense = { id: crypto.randomUUID(), spent_on: "2026-11-07", description: "Inventory purchase", amount_cents: 10000, voided: false, classification: "inventory_purchase" as const };
  const result = summarize([], [expense], 2500);
  expect(result.operatingExpenses).toBe(0);
  expect(result.productCosts).toBe(-2500);
  expect(result.netProfit).toBe(2500);
  expect(summarizeExpenses([expense])).toMatchObject({ total: 0, records: 1, voided: 0 });
});
