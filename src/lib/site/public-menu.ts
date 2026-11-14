import { z } from "zod";
import { imageUrlSchema, type Category, type Product } from "@/lib/menu/domain";

const price = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const publicProductSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(120), description: z.string().max(1000), category: z.string().max(120),
  image: imageUrlSchema.nullable(), price,
  sizes: z.array(z.object({ label: z.string().min(1).max(60), price }).strict()).max(20),
}).strict();
export const publicMenuSchema = z.object({
  status: z.enum(["published", "unpublished", "unavailable"]),
  products: z.array(publicProductSchema),
  featured_ids: z.array(z.uuid()).max(4).optional(),
}).strict();
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;
export type SaleRankRecord = {
  status?: string | null;
  items?: ReadonlyArray<{
    product_id?: string | null;
    name?: string | null;
    quantity?: number | null;
    line_total_cents?: number | null;
  }> | null;
};

/** Explicit allowlist: nested size costs must never cross the public boundary. */
export function projectPublicMenu(products: Product[], categories: Category[]): PublicProduct[] {
  return products.filter(product => product.active && !product.archived_at && (!product.sizes?.length || product.sizes.some(size => size.active))).map(product => {
    const sizes = (product.sizes ?? []).filter(size => size.active).map(size => ({ label: size.label, price: size.price_cents }));
    const image = imageUrlSchema.safeParse(product.image_url);
    const safeImage = image.success && (!image.data.startsWith("/") || /^\/(?:images|site|uploads)\/[a-zA-Z0-9_./%-]+$/.test(image.data) && !image.data.includes("..")) ? image.data : null;
    return publicProductSchema.parse({
      id: product.id, name: product.name, description: product.description ?? "",
      category: categories.find(category => category.id === product.category_id)?.name ?? "Menu selections",
      image: safeImage, price: sizes.length ? Math.min(...sizes.map(size => size.price)) : product.price_cents, sizes,
    });
  });
}

/** Aggregate completed POS sale quantities by active catalog product (top 4). */
export function topSellingProductIds(products: PublicProduct[], sales: ReadonlyArray<SaleRankRecord>): string[] {
  if (!products.length || !sales.length) return [];
  const byId = new Map(products.map(product => [product.id, product]));
  const byName = new Map(products.map(product => [product.name.trim().toLowerCase(), product]));
  const totals = new Map<string, { product: PublicProduct; quantity: number; revenue: number }>();

  for (const sale of sales) {
    if (sale.status !== "completed" || !Array.isArray(sale.items)) continue;
    for (const item of sale.items) {
      const qty = typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 0;
      if (!qty) continue;
      const itemName = typeof item.name === "string" ? item.name.trim() : "";
      const product =
        (item.product_id ? byId.get(item.product_id) : undefined) ??
        (itemName ? byName.get(itemName.toLowerCase()) ?? byName.get(itemName.split(" · ")[0].trim().toLowerCase()) : undefined);
      if (!product) continue;
      const rev = typeof item.line_total_cents === "number" && Number.isFinite(item.line_total_cents) ? Math.max(0, item.line_total_cents) : 0;
      const current = totals.get(product.id) ?? { product, quantity: 0, revenue: 0 };
      current.quantity += qty;
      current.revenue += rev;
      totals.set(product.id, current);
    }
  }

  return [...totals.values()]
    .sort(
      (a, b) =>
        b.quantity - a.quantity ||
        b.revenue - a.revenue ||
        Number(Boolean(b.product.image)) - Number(Boolean(a.product.image)) ||
        a.product.name.localeCompare(b.product.name),
    )
    .slice(0, 4)
    .map(entry => entry.product.id);
}

/** Owner-selected IDs first, then top-selling POS selections, falling back to photographed + alphabetical items. */
export function featuredProducts(products: PublicProduct[], ids: string[] = [], topIds: string[] = []) {
  const byPhotoThenName = [...products].sort(
    (a, b) => Number(Boolean(b.image)) - Number(Boolean(a.image)) || a.name.localeCompare(b.name),
  );
  const chosen = [...ids, ...topIds].flatMap(id => products.find(product => product.id === id) ?? []);
  return [...new Map([...chosen, ...byPhotoThenName].map(product => [product.id, product])).values()].slice(0, 4);
}
