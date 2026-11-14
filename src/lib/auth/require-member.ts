import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { accessFor, can, type PermissionModule } from "./permissions";
export async function requireMember(module?: PermissionModule | "users") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const loadActiveMember = () =>
    supabase
      .from("shop_members")
      .select("*,shops(id,name,timezone)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at")
      .limit(1)
      .maybeSingle();
  const { data: initialMember, error } = await loadActiveMember();
  if (error) throw new Error("Shop access could not be loaded.");
  let member = initialMember;
  if (!member?.shops) {
    const { data: existing } = await supabase.from("shop_members").select("id").eq("user_id", user.id).limit(1).maybeSingle();
    if (!existing) {
      const inviteToken = z.uuid().safeParse(user.user_metadata?.invite_token);
      if (inviteToken.success) {
        await supabase.rpc("accept_membership_invite", { p_token: inviteToken.data });
      }
      await supabase.rpc("resolve_shop_access");
      const retried = await loadActiveMember();
      if (retried.error) throw new Error("Shop access could not be loaded.");
      member = retried.data;
    }
    if (!member?.shops) redirect("/access-denied");
  }
  const access = accessFor(member.role, member.permissions);
  if (module && !can(access, module)) redirect("/app");
  return { supabase, user, shop: member.shops, role: member.role, access };
}
