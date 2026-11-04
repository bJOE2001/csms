import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import type { Product } from "@/lib/menu/domain";
import { projectPublicMenu, publicMenuSchema, type PublicMenu } from "./public-menu";

/** Opt-in publication for exactly one configured shop, independent of staff sessions. */
export async function readPublicMenu(): Promise<PublicMenu> {
  const shopId = process.env.PUBLIC_MENU_SHOP_ID;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL || Reflect.get(process.env, "NEXT_PUBLIC_SUPABASE_URL");
  if (!z.uuid().safeParse(shopId).success || !key || !url)
    return { status: "unpublished", products: [] };
  try {
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signal = AbortSignal.timeout(5000);
    const [products, categories] = await Promise.all([
      db.from("pos_products").select("id,name,description,image_url,price_cents,category_id,active,sizes")
        .eq("shop_id", shopId!).eq("active", true).is("archived_at", null).order("name").abortSignal(signal),
      db.from("pos_categories").select("id,name").eq("shop_id", shopId!).order("name").abortSignal(signal),
    ]);
    if (products.error || categories.error) throw new Error("Menu unavailable");
    if (!Array.isArray(products.data) || !Array.isArray(categories.data)) throw new Error("Menu unavailable");
    return publicMenuSchema.parse({ status: "published", products: projectPublicMenu(products.data as unknown as Product[], categories.data) });
  } catch {
    return { status: "unavailable", products: [] };
  }
}
