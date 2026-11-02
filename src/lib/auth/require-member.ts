import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireMember() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: member, error } = await supabase.from("shop_members")
    .select("shop_id,role,shops(id,name,timezone,setup_state)").eq("user_id", user.id).eq("status", "active")
    .order("created_at").limit(1).maybeSingle();
  if (error) throw new Error("Shop access could not be loaded. Check the applied migrations.");
  if (!member?.shops) redirect("/app");
  return { supabase, user, shop: member.shops, role: member.role };
}
