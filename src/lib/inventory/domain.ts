import { z } from "zod";

export const units = [
  { value: "g", label: "g — grams" },
  { value: "ml", label: "mL — milliliters" },
  { value: "each", label: "pcs — pieces" },
] as const;

export const itemTypes = [
  { value: "ingredient", label: "Ingredient", description: "Raw ingredients used in drinks or food, such as Ground Coffee, milk, or syrups." },
  { value: "supply", label: "Packaging / Supply", description: "Cups, lids, straws, stickers, sleeves, and takeaway packaging." },
  { value: "finished_good", label: "Finished Good", description: "Ready-to-sell pastries, bottled items, or snacks tracked per piece." },
] as const;

export function scaled(value: string) {
  if (!/^-?(0|[1-9]\d{0,11})(\.\d{1,6})?$/.test(value)) throw Error("Use a quantity with up to six decimal places.");
  const negative = value.startsWith("-"), [whole, fraction = ""] = value.replace("-", "").split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))) * (negative ? -1n : 1n);
}

export function decimal(value: bigint) {
  const sign = value < 0 ? "-" : "", positive = value < 0 ? -value : value;
  const fraction = String(positive % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return `${sign}${positive / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

/** Decimal cents to display PHP without floating-point multiplication. */
export function preciseMoney(value: string | number, digits = 6) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return "Not recorded";
  const fraction = match[2] ?? "", denominator = 10n ** BigInt(fraction.length) * 100n;
  const numerator = (BigInt(match[1]) * 10n ** BigInt(fraction.length) + BigInt(fraction || "0")) * 10n ** BigInt(digits);
  const rounded = (numerator + denominator / 2n) / denominator;
  const scale = 10n ** BigInt(digits);
  return `₱${String(rounded / scale).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(rounded % scale).padStart(digits, "0")}`;
}

/** Display unit/component costs with two PHP decimal places; calculations retain their original precision. */
export function formatUnitCost(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "Not recorded";
  return preciseMoney(String(value).trim(), 2);
}

export function unitLabel(unit?: string | null) {
  if (!unit) return "";
  return unit === "each" ? "pcs" : unit === "ml" ? "mL" : unit;
}

export function displayQuantity(value: string | number, unit?: string) {
  const text = decimal(scaled(String(value)));
  const [whole, fraction] = text.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}${unit ? ` ${unitLabel(unit)}` : ""}`;
}

export function signedQuantity(value: string | number, unit?: string) {
  const amount = scaled(String(value));
  const formatted = displayQuantity(value, unit);
  return amount > 0n ? `+${formatted}` : formatted;
}

const quantity = z.string().trim().refine(value => { try { scaled(value); return true; } catch { return false; } }, "Use up to six decimal places.");
const quantityOrInvalid = (value: string) => { try { return scaled(value); } catch { return -1n; } };

export const itemSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, "Enter an item name.").max(120),
  item_type: z.enum(["ingredient", "supply", "finished_good"]),
  base_unit: z.enum(["g", "ml", "each"]),
  minimum_stock: quantity.refine(value => quantityOrInvalid(value) >= 0n, "Low-stock threshold cannot be negative."),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
}).strict();

export const stockSchema = z.object({
  operation_id: z.uuid(),
  ingredient_id: z.uuid(),
  kind: z.enum(["opening", "receipt", "count", "waste", "correction"]),
  quantity,
  purchase_unit: z.enum(["g", "kg", "ml", "L", "each"]),
  total_cost_cents: z.number().int().min(0).max(100000000000).optional(),
  occurred_on: z.iso.date(),
  reason: z.string().trim().min(1, "Enter a reason for this stock record.").max(500),
  notes: z.string().trim().max(1000).optional(),
  supplier: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  expected_revision: z.number().int().nonnegative().optional(),
}).strict();

export const recipeSchema = z.object({
  operation_id: z.uuid(),
  product_id: z.uuid(),
  size_id: z.uuid().nullable().optional(),
  expected_revision: z.number().int().nonnegative(),
  action: z.enum(["draft", "activate", "deactivate"]),
  mode: z.enum(["recipe", "finished_good"]).optional(),
  components: z.array(z.object({
    ingredient_id: z.uuid("Choose an inventory item."),
    quantity: quantity.refine(value => quantityOrInvalid(value) > 0n, "Component quantity must be positive."),
  }).strict()).max(50).optional(),
}).strict();

export const returnSchema = z.object({
  operation_id: z.uuid(),
  consumption_id: z.uuid(),
  quantity: quantity.refine(value => quantityOrInvalid(value) > 0n),
  reason: z.string().trim().min(1).max(500),
}).strict();

export const inventoryRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("item"), data: itemSchema.extend({initial_stock:z.object({operation_id:z.uuid(),quantity:z.string(),total_cost_cents:z.number().int().min(0).max(100000000000),occurred_on:z.iso.date()}).strict().optional()}) }),
  z.object({ action: z.literal("stock"), data: stockSchema }),
  z.object({ action: z.literal("recipe"), data: recipeSchema }),
  z.object({ action: z.literal("return"), data: returnSchema }),
]);

export type InventoryItem = z.infer<typeof itemSchema> & {
  quantity: string | number;
  value_cents: number | null;
  unit_cost_cents: string | number | null;
  revision: number;
  has_movements?: boolean;
  unit_locked?: boolean;
};

export type Component = {
  ingredient_id: string;
  name: string;
  base_unit: string;
  quantity: string | number;
  active?: boolean;
  quantity_on_hand?: string | number;
  unit_cost_cents?: string | number | null;
  component_cost_cents?: string | number | null;
};

export type Recipe = {
  id: string;
  mode: "recipe" | "finished_good";
  version: number;
  components: Component[];
  cost_cents: number | null;
  max_quantity: number;
};

export type InventoryConfig = {
  product_id: string;
  product_name?: string;
  size_key: string;
  revision: number;
  active: Recipe | null;
  draft: Recipe | null;
};

export type Movement = {
  id: string;
  ingredient_id: string;
  name: string;
  base_unit: string;
  kind: string;
  quantity_delta: string | number;
  value_delta_cents: number | null;
  previous_quantity: string | number | null;
  resulting_quantity: string | number | null;
  occurred_on: string;
  created_at: string;
  created_by: string;
  source_id: string;
  reason: string;
  notes?: string | null;
  supplier?: string | null;
  reference?: string | null;
  purchase_unit?: string | null;
  entered_quantity?: string | number | null;
};

export type Returnable = {
  id: string;
  ingredient_name: string;
  remaining_quantity: string | number;
  base_unit: string;
  receipt: string;
};

export type InventoryData = {
  items: InventoryItem[];
  movements: Movement[];
  configs: InventoryConfig[];
  returnable: Returnable[];
};

export type StockStatus = "Inactive" | "Out of Stock" | "Low Stock" | "In Stock";

export function stockStatus(item: InventoryItem): StockStatus {
  if (!item.active) return "Inactive";
  const qty = scaled(String(item.quantity));
  return qty <= 0n ? "Out of Stock" : qty <= scaled(String(item.minimum_stock)) ? "Low Stock" : "In Stock";
}

export function canSetOpeningStock(item: InventoryItem) {
  return item.active && !item.has_movements && item.revision === 0 && scaled(String(item.quantity)) === 0n;
}

export function isBaseUnitLocked(item?: InventoryItem) {
  if (!item) return false;
  return Boolean(item.unit_locked || item.has_movements || item.revision > 0);
}
