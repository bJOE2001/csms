import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { publicMenuSchema, type PublicMenu } from "./public-menu";

/** Read only the database's published, customer-safe catalog, without staff sessions or elevated keys. */
export async function readPublicMenu(): Promise<PublicMenu> {
  const shopId = process.env.PUBLIC_MENU_SHOP_ID?.trim();
  if (shopId && !z.uuid().safeParse(shopId).success)
    return { status: "unpublished", products: [] };
  let connection: ReturnType<typeof getSupabasePublicEnv>;
  try { connection = getSupabasePublicEnv(); }
  catch { return { status: "unpublished", products: [] }; }
  try {
    const db = createClient<Database>(connection.url, connection.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const signal = AbortSignal.timeout(5000);
    const result = await db.rpc("read_public_menu", shopId ? { p_shop_id: shopId } : {}).abortSignal(signal);
    if (result.error) throw new Error("Menu unavailable");
    return publicMenuSchema.parse(result.data);
  } catch {
    return { status: "unavailable", products: [] };
  }
}
