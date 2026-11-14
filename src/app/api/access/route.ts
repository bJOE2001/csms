import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessFor } from "@/lib/auth/permissions";
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const { data: member, error } = await db.from("shop_members").select("*,shops(id,name,timezone)")
    .eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: "Access could not be checked." }, { status: 503 });
  if (!member?.shops) return NextResponse.json({ error: "No active shop access." }, { status: 403 });
  return NextResponse.json({ shop: member.shops, access: accessFor(member.role, member.permissions) }, { headers: { "Cache-Control": "private, no-store" } });
}
