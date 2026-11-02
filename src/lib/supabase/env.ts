import { z } from "zod";

const publicSupabaseEnv = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
});

export function getSupabasePublicEnv() {
  const serverUrl = process.env.SUPABASE_URL;
  const serverKey = process.env.SUPABASE_ANON_KEY;
  if ((serverUrl || serverKey) && !(serverUrl && serverKey)) {
    throw new Error(
      "Set both SUPABASE_URL and SUPABASE_ANON_KEY for a server runtime override.",
    );
  }
  const result = publicSupabaseEnv.safeParse({
    // This helper runs only on the server/middleware. Runtime lookup also lets
    // isolated integration servers supply configuration without editing env files.
    url: serverUrl || Reflect.get(process.env, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey:
      serverKey || Reflect.get(process.env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  });
  if (!result.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return result.data;
}
