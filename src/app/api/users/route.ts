import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";
import { userRequestSchema } from "@/lib/users/domain";

async function owner() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to manage users." }, { status: 401 }) };
  const { data: member, error } = await db.from("shop_members").select("*").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (error) return { response: NextResponse.json({ error: "Shop access could not be checked." }, { status: 503 }) };
  if (member?.role !== "founder") return { response: NextResponse.json({ error: "Only an owner can manage users." }, { status: 403 }) };
  return { db, member };
}
function failure(error: { code?: string; message: string }) {
  return NextResponse.json({ error: error.code === "PGRST202"
    ? "Apply the User Management migration to enable user access controls."
    : ["42501", "P0001"].includes(error.code ?? "") ? error.message : "User changes could not be saved. Refresh and retry." },
  { status: error.code === "PGRST202" ? 503 : error.code === "42501" ? 403 : 422 });
}
export async function GET() {
  const access = await owner();
  if (access.response) return access.response;
  const { data, error } = await access.db.rpc("read_shop_users", { p_shop_id: access.member.shop_id });
  return error ? failure(error) : NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, process.env.APP_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const access = await owner();
  if (access.response) return access.response;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 16384) { await reader.cancel(); return NextResponse.json({ error: "Request too large" }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const body = userRequestSchema.parse(JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))));
    const { data, error } = await access.db.rpc("manage_shop_user", { p_shop_id: access.member.shop_id, p_data: body });
    if (error) return failure(error);
    revalidatePath("/app", "layout");
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Check the email, status, and selected permissions." }, { status: 400 });
  }
}
