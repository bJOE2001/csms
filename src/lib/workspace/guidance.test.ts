import { describe, expect, it } from "vitest";
import { getNextStep } from "./guidance";
describe("dashboard next steps", () => {
  it("starts an empty shop with menu setup", () => { expect(getNextStep({}, "founder").href).toBe("/app/menu"); });
  it("sends a seeded but unavailable menu to recipe and availability review", () => { expect(getNextStep({ products: 6, ingredients: 13, available_variants: 0 }, "founder").href).toBe("/app/menu"); });
  it("requires recorded stock before recommending a shift", () => { expect(getNextStep({ products: 6, ingredients: 13, available_variants: 2, stock_entries: 0 }, "founder").href).toBe("/app/inventory"); });
  it("gives staff an allowed daily action", () => { expect(getNextStep({}, "staff").href).toBe("/app/shifts"); });
});
