import { z } from "zod";
import { asCents, type Cents } from "@/lib/money";

const decimalSchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/, "Use a nonnegative decimal with at most six decimal places.");
const quantitySchema = decimalSchema.refine((value) => /[1-9]/.test(value), "Quantity must be greater than zero.");
const wasteSchema = z.number().int().min(0).max(10000);
const nameSchema = z.string().trim().min(1).max(120);

function scaled(value: string, precision: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0") || "0");
}

export function phpToCents(value: string): Cents {
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter PHP with at most two decimal places.");
  const cents = scaled(value, 2);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Amount exceeds safe currency range.");
  return asCents(Number(cents));
}

/** An estimated base-unit cost can contain fractional centavos (six decimal places). */
export function phpToCentavoDecimal(value: string): string {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/.test(value)) throw new Error("Use at most eight PHP decimal places for an estimated unit cost.");
  const micros = scaled(value, 8);
  return `${micros / 1_000_000n}.${(micros % 1_000_000n).toString().padStart(6, "0")}`;
}

export function centavoDecimalToPhp(value: string): string {
  const micros = scaled(decimalSchema.parse(value), 6);
  const fraction = (micros % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return `${micros / 100_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export const categoryInputSchema = z.object({ name: nameSchema });
const priceSchema = z.string().transform((value, context) => {
  try { return phpToCents(value); } catch {
    context.addIssue({ code: "custom", message: "Enter a valid PHP price with at most two decimal places." });
    return z.NEVER;
  }
});
const estimateSchema = z.string().transform((value, context) => {
  if (value === "") return null;
  try { return phpToCentavoDecimal(value); } catch {
    context.addIssue({ code: "custom", message: "Enter an estimated PHP cost with at most eight decimal places, or leave it blank." });
    return z.NEVER;
  }
});
export const productInputSchema = z.object({
  category_id: z.uuid(),
  product_name: nameSchema,
  variant_name: nameSchema,
  price: priceSchema,
});
export const variantInputSchema = z.object({
  product_id: z.uuid(), variant_name: nameSchema, price: priceSchema,
});
export const priceInputSchema = z.object({ variant_id: z.uuid(), price: priceSchema });
export const estimateInputSchema = z.object({ ingredient_id: z.uuid(), estimated_unit_cost_php: estimateSchema });
export const ingredientInputSchema = z.object({
  name: nameSchema,
  base_unit: z.enum(["g", "ml", "each"]),
  estimated_unit_cost_php: estimateSchema,
  minimum_stock: decimalSchema,
});
export const recipeInputSchema = z.object({
  variant_id: z.uuid(),
  items: z.array(z.object({ ingredient_id: z.uuid(), quantity: quantitySchema, waste_bps: wasteSchema }).strict()).min(1).max(64),
}).refine(({ items }) => new Set(items.map((item) => item.ingredient_id)).size === items.length, "Each ingredient must occur only once.");

type CostLine = { quantity: string; wasteBps: number; unitCostCentavos: string | null };
type CostResult = { status: "estimated"; cents: Cents } | { status: "unavailable"; cents: null };

export function estimateRecipeCost(lines: CostLine[]): CostResult {
  if (!lines.length || lines.some((line) => line.unitCostCentavos === null)) return { status: "unavailable", cents: null };
  let numerator = 0n;
  for (const line of lines) {
    const quantity = scaled(quantitySchema.parse(line.quantity), 6);
    const unitCost = scaled(decimalSchema.parse(line.unitCostCentavos), 6);
    const waste = BigInt(wasteSchema.parse(line.wasteBps));
    numerator += quantity * unitCost * (10000n + waste);
  }
  const denominator = 10_000_000_000_000_000n;
  const cents = (numerator + denominator - 1n) / denominator;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Recipe estimate exceeds safe currency range.");
  return { status: "estimated", cents: asCents(Number(cents)) };
}
