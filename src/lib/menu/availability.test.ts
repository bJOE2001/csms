import { describe, expect, it } from "vitest";
import { optionUnavailableReason, productUnavailableReason } from "./availability";
import { isAvailable, type Product } from "./domain";

const product: Product = {
  id: "00000000-0000-4000-8000-000000000001", name: "Latte", active: true, price_cents: 12000,
  inventory: { regular: { state: "active", max_quantity: 10, cost_cents: 0 } },
};

describe("selling status explanations", () => {
  it("distinguishes the owner's selling switch from a missing or unactivated recipe", () => {
    expect(optionUnavailableReason({ ...product, active: false, inventory: {} })).toBe("Disabled by owner");
    expect(optionUnavailableReason({ ...product, inventory: {} })).toBe("Recipe missing");
    expect(optionUnavailableReason({ ...product, inventory: { regular: { state: "draft", max_quantity: null } } })).toBe("Recipe not activated");
    expect(optionUnavailableReason({ ...product, archived_at: "2026-11-08" })).toBe("Product archived");
  });

  it("explains stock shortages without mislabelling missing cost information", () => {
    const stock = { ...product, inventory: { regular: { state: "active" as const, max_quantity: 0, cost_cents: 900 } } };
    expect(optionUnavailableReason(stock)).toBe("Insufficient stock");
    expect(optionUnavailableReason({ ...stock, inventory: { regular: { ...stock.inventory.regular, cost_cents: null } } })).toBe("Preparation cost unavailable");
    expect(optionUnavailableReason({ ...stock, inventory: { regular: { state: "active", max_quantity: 0 } } })).toBe("Inventory unavailable");
  });

  it("uses the supplied component details without exposing or inventing data", () => {
    const component = { ingredient_id: "coffee", name: "Coffee", base_unit: "g" as const, quantity: "18", active: false, unit_cost_cents: "50" };
    const recipe = { state: "active" as const, max_quantity: 0, cost_cents: null, components: [component] };
    expect(optionUnavailableReason({ ...product, inventory: { regular: recipe } })).toBe("Inventory item inactive");
    expect(optionUnavailableReason({ ...product, inventory: { regular: { ...recipe, components: [{ ...component, active: true, unit_cost_cents: null }] } } })).toBe("Inventory cost missing");
  });

  it("keeps genuinely free recipes available under the existing selling rules", () => {
    expect(isAvailable(product)).toBe(true);
    expect(optionUnavailableReason(product)).toBeUndefined();
    expect(productUnavailableReason(product)).toBeUndefined();
  });

  it("reports each size independently while allowing another configured size to sell", () => {
    const sized: Product = { ...product, sizes: [
      { id: "small", label: "12 oz", active: false, is_default: true, price_cents: 12000, cost_cents: 0 },
      { id: "large", label: "16 oz", active: true, is_default: false, price_cents: 14500, cost_cents: 0 },
    ], inventory: { large: { state: "active", max_quantity: 10, cost_cents: 0 } } };
    expect(optionUnavailableReason(sized, "small")).toBe("Size disabled by owner");
    expect(optionUnavailableReason(sized, "large")).toBeUndefined();
    expect(optionUnavailableReason(sized)).toBe("Select a size");
    expect(productUnavailableReason(sized)).toBeUndefined();
    const disabled = { ...sized, sizes: sized.sizes!.map(size => ({ ...size, active: false })) };
    expect(productUnavailableReason(disabled)).toBe("No sizes enabled");
  });

  it("summarizes matching or mixed size blockers without substituting a guessed cause", () => {
    const sized: Product = { ...product, sizes: [
      { id: "small", label: "12 oz", active: true, is_default: true, price_cents: 12000, cost_cents: null },
      { id: "large", label: "16 oz", active: true, is_default: false, price_cents: 14500, cost_cents: null },
    ], inventory: {} };
    expect(productUnavailableReason(sized)).toBe("Recipe missing");
    expect(productUnavailableReason({ ...sized, inventory: { large: { state: "active", max_quantity: 0, cost_cents: 0 } } })).toBe("Sizes unavailable");
  });
});
