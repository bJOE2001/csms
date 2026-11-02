import { z } from "zod";

const amount = z.number().int().min(0).max(100000000);
export const imageUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    if (/^\/(?!\/).+/.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an HTTPS image URL or a local /path.");
export const sizeSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(60),
    price_cents: amount,
    cost_cents: amount.nullable(),
    active: z.boolean(),
    is_default: z.boolean(),
  })
  .strict();
export const sizesSchema = z
  .array(sizeSchema)
  .max(20)
  .superRefine((sizes, ctx) => {
    if (new Set(sizes.map((size) => size.id)).size !== sizes.length)
      ctx.addIssue({ code: "custom", message: "Size IDs must be unique." });
    if (
      new Set(sizes.map((size) => size.label.toLocaleLowerCase())).size !==
      sizes.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Size labels must be unique within a product.",
      });
    if (sizes.length && sizes.filter((size) => size.is_default).length !== 1)
      ctx.addIssue({
        code: "custom",
        message: "Choose exactly one default size.",
      });
  });
export const productSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  price_cents: amount,
  cost_cents: amount.nullable().optional(),
  active: z.boolean(),
  category_id: z.uuid().nullable().optional(),
  description: z.string().trim().max(1000).optional(),
  image_url: imageUrlSchema.nullable().optional(),
  sizes: sizesSchema.optional(),
});
export const categorySchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(60),
});
export type ProductSize = z.infer<typeof sizeSchema>;
export type Product = Omit<z.infer<typeof productSchema>, "id"> & {
  id: string;
  archived_at?: string | null;
};
export type Category = { id: string; name: string };
export type ShopData = {
  shop: { id: string; name: string };
  user_id: string;
  founder: boolean;
  products: Product[];
  categories: Category[];
};
export function defaultSizeId(product: Product) {
  const sizes = product.sizes ?? [];
  return (
    sizes.find((size) => size.active && size.is_default) ??
    sizes.find((size) => size.active)
  )?.id;
}
export function isAvailable(product: Product) {
  return (
    product.active &&
    !product.archived_at &&
    (!product.sizes?.length || product.sizes.some((size) => size.active))
  );
}
export function saleOption(product: Product, sizeId?: string) {
  if (!isAvailable(product)) return undefined;
  if (product.sizes?.length) {
    const size = product.sizes.find(
      (size) => size.id === sizeId && size.active,
    );
    return size
      ? {
          size_id: size.id,
          size_label: size.label,
          price_cents: size.price_cents,
          cost_cents: size.cost_cents,
        }
      : undefined;
  }
  return sizeId
    ? undefined
    : { price_cents: product.price_cents, cost_cents: product.cost_cents };
}
export function priceRange(product: Product) {
  const prices = product.sizes?.length
    ? product.sizes.map((size) => size.price_cents)
    : [product.price_cents];
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
