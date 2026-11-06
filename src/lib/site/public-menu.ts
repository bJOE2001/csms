import { z } from "zod";
import { imageUrlSchema, isAvailable, type Category, type Product } from "@/lib/menu/domain";

const price = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const publicProductSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(120), description: z.string().max(1000), category: z.string().max(120),
  image: imageUrlSchema.nullable(), price,
  sizes: z.array(z.object({ label: z.string().min(1).max(60), price }).strict()).max(20),
}).strict();
export const publicMenuSchema = z.object({
  status: z.enum(["published", "unpublished", "unavailable"]), products: z.array(publicProductSchema),
}).strict();
export type PublicProduct = z.infer<typeof publicProductSchema>;
export type PublicMenu = z.infer<typeof publicMenuSchema>;

/** Explicit allowlist: nested size costs must never cross the public boundary. */
export function projectPublicMenu(products: Product[], categories: Category[]): PublicProduct[] {
  return products.filter(isAvailable).map(product => {
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

/** Owner-selected IDs first; otherwise a stable alphabetical selection, never a sales ranking. */
export function featuredProducts(products: PublicProduct[], ids: string[] = []) {
  const byName = [...products].sort((a, b) => a.name.localeCompare(b.name));
  const chosen = ids.flatMap(id => products.find(product => product.id === id) ?? []);
  return [...new Map([...chosen, ...byName].map(product => [product.id, product])).values()].slice(0, 4);
}
