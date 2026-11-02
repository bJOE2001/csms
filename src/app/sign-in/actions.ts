"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/sign-in?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/sign-in?error=credentials");
  (await cookies()).delete("csms_pos_locked");
  redirect("/app");
}
