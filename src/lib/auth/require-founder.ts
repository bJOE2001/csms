import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Management routes and actions share this boundary; SQL functions recheck it. */
export async function requireFounder() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/sign-in");
  const { data: membership, error } = await supabase.from("shop_members")
    .select("shop_id, role, shops(id, name, timezone, setup_state)")
    .eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (error) throw new Error("Shop membership could not be loaded. Please try again.");
  if (!membership || membership.role !== "founder" || !membership.shops) redirect("/app?notice=founder_access");
  return { supabase, user, shop: membership.shops };
}
