import { inventoryAvailable, isAvailable, type Product } from "./domain";

/** Display-only reasons. Selling eligibility remains owned by the existing catalog rules. */
export function optionUnavailableReason(product: Product, sizeId?: string): string | undefined {
  if (product.archived_at) return "Product archived";
  if (!product.active) return "Disabled by owner";
  if (product.sizes?.length) {
    const size = product.sizes.find(size => size.id === sizeId);
    if (!size) return product.sizes.some(size => size.active) ? "Select a size" : "No sizes enabled";
    if (!size.active) return "Size disabled by owner";
  }
  if (inventoryAvailable(product, sizeId)) return undefined;

  const recipe = product.inventory?.[sizeId ?? "regular"];
  if (recipe?.state === "draft") return "Recipe not activated";
  if (recipe?.state !== "active") return "Recipe missing";
  if (recipe.components?.some(component => component.active === false)) return "Inventory item inactive";
  if (recipe.components?.some(component => component.unit_cost_cents === null)) return "Inventory cost missing";
  if (recipe.cost_cents === null) return "Preparation cost unavailable";
  if (recipe.max_quantity != null && recipe.max_quantity <= 0 && recipe.cost_cents != null) return "Insufficient stock";
  // Staff responses omit cost/component details, so zero capacity alone cannot identify the cause.
  return "Inventory unavailable";
}

export function productUnavailableReason(product: Product): string | undefined {
  if (isAvailable(product)) return undefined;
  if (!product.active || product.archived_at || !product.sizes?.length) return optionUnavailableReason(product);
  const enabled = product.sizes.filter(size => size.active);
  if (!enabled.length) return "No sizes enabled";
  const reasons = new Set(enabled.map(size => optionUnavailableReason(product, size.id)));
  return reasons.size === 1 ? [...reasons][0] : "Sizes unavailable";
}
