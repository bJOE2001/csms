"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const shopSchema = z.object({ name: z.string().trim().min(1).max(120), timezone: z.string().trim().min(1).max(80) });

export async function createShop(formData: FormData) {
  const input = shopSchema.safeParse({ name: formData.get("name"), timezone: formData.get("timezone") });
  if (!input.success) redirect("/app/setup?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_shop", { shop_name: input.data.name, shop_timezone: input.data.timezone });
  if (error) redirect("/app/setup?error=create");
  redirect("/app");
}
