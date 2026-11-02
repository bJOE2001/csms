import type { createClient } from "@/lib/supabase/server";

export async function loadMenu(client: Awaited<ReturnType<typeof createClient>>, shopId: string) {
  const results = await Promise.all([
    client.from("categories").select("*").eq("shop_id", shopId).order("name").limit(1000),
    client.from("products").select("*").eq("shop_id", shopId).order("name").limit(1000),
    client.from("product_variants").select("*").eq("shop_id", shopId).order("name").limit(1000),
    client.from("product_prices").select("*").eq("shop_id", shopId).order("version", { ascending: false }).limit(1000),
    client.from("ingredients").select("id, shop_id, name, base_unit, estimated_unit_cost_cents::text, minimum_stock::text, created_at").eq("shop_id", shopId).order("name").limit(1000),
    client.from("recipes").select("*").eq("shop_id", shopId).order("version", { ascending: false }).limit(1000),
  ]);
  if (results.some((result) => result.error)) throw new Error("Menu records could not be loaded. Check the database migrations and try again.");
  if (results.some((result) => result.data && result.data.length >= 1000)) throw new Error("This view has reached its record limit. Pagination is required before loading more records.");
  const [categories, products, variants, prices, ingredients, recipes] = results;
  return { categories: categories.data ?? [], products: products.data ?? [], variants: variants.data ?? [], prices: prices.data ?? [], ingredients: ingredients.data ?? [], recipes: recipes.data ?? [] };
}

export function latestByVariant<T extends { variant_id: string; version: number }>(rows: T[]): Map<string, T> {
  const versions = new Map<string, T>();
  for (const row of rows) {
    if ((versions.get(row.variant_id)?.version ?? 0) < row.version) versions.set(row.variant_id, row);
  }
  return versions;
}
