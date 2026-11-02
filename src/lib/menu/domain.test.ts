import { describe, expect, it } from "vitest";
import { centavoDecimalToPhp, estimateRecipeCost, phpToCents, phpToCentavoDecimal, recipeInputSchema } from "./domain";

describe("fixed precision menu amounts", () => {
  it("converts PHP strings exactly and rejects fractional centavos for prices", () => {
    expect(phpToCents("125.05")).toBe(12505);
    expect(phpToCentavoDecimal("0.01234567")).toBe("1.234567");
    expect(centavoDecimalToPhp(phpToCentavoDecimal("0.01234567"))).toBe("0.01234567");
    expect(() => phpToCents("1.001")).toThrow();
    expect(() => phpToCents("-1")).toThrow();
    expect(() => phpToCents("90071992547410.00")).toThrow();
  });
});

describe("estimated recipe cost", () => {
  it("adds exact fractional ingredient costs and rounds only the final total up", () => {
    expect(estimateRecipeCost([
      { quantity: "18", wasteBps: 500, unitCostCentavos: "60" },
      { quantity: "150", wasteBps: 0, unitCostCentavos: "8.25" },
    ])).toEqual({ status: "estimated", cents: 2372 });
    expect(estimateRecipeCost([
      { quantity: "0.1", wasteBps: 0, unitCostCentavos: "1" },
      { quantity: "0.1", wasteBps: 0, unitCostCentavos: "1" },
    ])).toEqual({ status: "estimated", cents: 1 });
  });

  it("reports unavailable when any estimate is missing, including an empty recipe", () => {
    expect(estimateRecipeCost([])).toEqual({ status: "unavailable", cents: null });
    expect(estimateRecipeCost([{ quantity: "18", wasteBps: 0, unitCostCentavos: null }])).toEqual({ status: "unavailable", cents: null });
  });

  it("rejects unsupported precision, invalid waste, and overflow", () => {
    expect(() => estimateRecipeCost([{ quantity: "1.0000001", wasteBps: 0, unitCostCentavos: "1" }])).toThrow();
    expect(() => estimateRecipeCost([{ quantity: "1", wasteBps: -1, unitCostCentavos: "1" }])).toThrow();
    expect(() => estimateRecipeCost([{ quantity: "999999999999", wasteBps: 10000, unitCostCentavos: "999999999999" }])).toThrow();
  });

  it("rejects duplicate ingredients and zero quantity at the request boundary", () => {
    const id = "1a8a3355-4528-4c54-98ab-6923ff9b0ec7";
    const line = { ingredient_id: id, quantity: "1", waste_bps: 0 };
    expect(recipeInputSchema.safeParse({ variant_id: id, items: [line, line] }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ variant_id: id, items: [{ ...line, quantity: "0" }] }).success).toBe(false);
  });
});
