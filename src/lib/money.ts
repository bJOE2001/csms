import { z } from "zod";

/** Monetary amounts are stored as integer PHP centavos throughout the domain. */
export const centsSchema = z.number().int().nonnegative();
export type Cents = number & { readonly __brand: "Cents" };

export function asCents(value: number): Cents {
  return centsSchema.parse(value) as Cents;
}

export function addCents(...values: Cents[]): Cents {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError("Currency total exceeds safe integer range");
  return asCents(total);
}

export function formatPhp(cents: Cents, locale = "en-PH"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "PHP" }).format(cents / 100);
}

/** Exact decimal text for editable inputs, including the full safe-integer range. */
export function centsToDecimal(cents: Cents): string {
  const value = BigInt(asCents(cents));
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}
