import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";
import { inventoryRequest } from "@/lib/inventory/domain";
import { dateRangeError, salesRange, shopDate } from "@/lib/sales/period";

async function access() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Sign in to open Inventory." }, { status: 401 }) };
  const { data: member, error } = await db.from("shop_members").select("shop_id,role,shops(timezone)").eq("user_id", user.id).eq("status", "active").order("created_at").limit(1).maybeSingle();
  if (error) return { response: NextResponse.json({ error: "Shop access could not load." }, { status: 503 }) };
  if (!member || member.role !== "founder") return { response: NextResponse.json({ error: "Owner access required." }, { status: 403 }) };
  return { db, member };
}
export async function GET(request: NextRequest) {
  const permission = await access(); if (permission.response) return permission.response;
  const { db, member } = permission;
  const { from, to } = salesRange(Object.fromEntries(request.nextUrl.searchParams), shopDate(member.shops.timezone));
  if ((request.nextUrl.searchParams.has("from") && request.nextUrl.searchParams.get("from") !== from) || (request.nextUrl.searchParams.has("to") && request.nextUrl.searchParams.get("to") !== to))
    return NextResponse.json({ error: "Choose valid reporting dates." }, { status: 400 });
  const invalid = dateRangeError(from, to);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const { data, error } = await db.rpc("pos_inventory_read", { p_shop_id: member.shop_id, p_from: from, p_to: to });
  return error ? failure(error) : NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
function failure(error: { code?: string; message: string }) {
  return NextResponse.json({ error: error.code === "PGRST202" ? "Apply the Inventory migrations before opening Inventory." : ["P0001", "42501"].includes(error.code ?? "") ? error.message : "Inventory could not be saved. Refresh and retry with the same details." }, { status: error.code === "PGRST202" ? 503 : 422 });
}
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, process.env.APP_URL)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const permission = await access(); if (permission.response) return permission.response;
  try {
    const reader = request.body?.getReader(); if (!reader) throw Error();
    let text = "", bytes = 0; const decoder = new TextDecoder();
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 32768) { await reader.cancel(); return NextResponse.json({ error: "Request too large" }, { status: 413 }); }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
    const body = inventoryRequest.parse(JSON.parse(text));
    const rpc = ({ item: "pos_inventory_create_item", stock: "pos_inventory_post", recipe: "pos_inventory_recipe", return: "pos_inventory_return" } as const)[body.action];
    const { data, error } = await permission.db.rpc(rpc, { p_shop_id: permission.member.shop_id, p_data: body.data });
    if (error) return failure(error);
    for (const path of ["/app/inventory", "/app/menu", "/pos", "/dashboard", "/app/sales"]) revalidatePath(path);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return NextResponse.json({ error: "Check the inventory fields and try again." }, { status: 400 }); }
}
