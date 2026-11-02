import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();
  return createServerClient<Database>(
    url,
    anonKey,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookiesToSet) => {
      try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server components cannot write response cookies. Middleware refreshes the session. */ }
    } } },
  );
}
