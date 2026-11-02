"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { phpToCents, phpToCentavoDecimal } from "@/lib/menu/domain";
import type { ActionState } from "@/lib/menu/action-state";
import type { Json } from "@/lib/supabase/database.types";

const uuid = z.uuid();
const allowed = {
  inventory: ["supplier", "purchase", "purchase_status", "receive", "opening", "count", "waste", "correction"],
  finance: ["budget", "funding", "expense", "decide_expense", "decide_funding", "open_shift", "cash_movement", "decide_cash"],
  settings: ["business", "device", "member", "rename_category", "rename_product"],
  order: ["confirm_payment", "refund", "cancel", "return_stock"],
} as const;

export async function businessAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireMember();
  try {
    const moduleName = String(form.get("module")); const action = String(form.get("action"));
    const data: { [key: string]: Json } = {};
    for (const [key, value] of form) {
      if (typeof value === "string" && !["module", "action", "operation_id"].includes(key) && !key.startsWith("$ACTION")) {
        if (value.length > 20000) throw new Error("Input is too large.");
        if (value !== "") data[key] = value.trim();
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (key.endsWith("_php")) { data[key.replace(/_php$/, "_cents")] = phpToCents(String(value)); delete data[key]; }
    }
    if (action === "cash_movement" && form.get("direction") === "out") data.amount_cents = -Number(data.amount_cents);
    if (action === "business") data.payment_methods = String(form.get("methods") ?? "cash,gcash").split(",").map(v => v.trim()).filter(Boolean);
    if (action === "purchase") {
      const lines = z.array(z.object({ ingredient_id: uuid, quantity: z.string().regex(/^(0|[1-9]\d{0,11})(\.\d{1,6})?$/), unit_cost_php: z.string() }).strict()).min(1).max(100)
        .parse(JSON.parse(String(form.get("items_json"))));
      data.items = lines.map(line => ({ ingredient_id: line.ingredient_id, quantity: line.quantity, unit_cost_cents: phpToCentavoDecimal(line.unit_cost_php) }));
      delete data.items_json;
    }
    if (action === "receive") data.items = [{ id: uuid.parse(form.get("item_id")), quantity: String(form.get("quantity")) }];
    const operationId = form.get("operation_id") ? uuid.parse(form.get("operation_id")) : crypto.randomUUID();
    const document = form.get("document");
    if (document instanceof File && document.size > 0) {
      if (document.size > 10_485_760 || !["application/pdf", "image/jpeg", "image/png"].includes(document.type)) throw new Error("Upload a PDF, PNG or JPEG up to 10 MB.");
      const signature=Array.from(new Uint8Array(await document.slice(0,8).arrayBuffer())).map(b=>b.toString(16).padStart(2,"0")).join("");
      if(!(document.type==="application/pdf"&&signature.startsWith("255044462d"))&&!(document.type==="image/png"&&signature==="89504e470d0a1a0a")&&!(document.type==="image/jpeg"&&signature.startsWith("ffd8ff")))throw new Error("The file content does not match its PDF/image type.");
      const path = `${shop.id}/${operationId}.${document.type === "application/pdf" ? "pdf" : document.type === "image/png" ? "png" : "jpg"}`;
      const { error: uploadError } = await supabase.storage.from("business-documents").upload(path, document, { contentType: document.type, upsert: false });
      if (uploadError && uploadError.statusCode !== "409") throw new Error("The private receipt could not be uploaded. Check Storage configuration.");
      data.document_path = path;
    }
    let error: { message: string; code: string } | null;
    if (moduleName === "shift" && ["close","review"].includes(action)) {
      ({ error } = await supabase.rpc(action==="review"?"review_cashier_shift":"close_cashier_shift", { p_shop_id: shop.id, p_data: data, p_operation_id: operationId }));
    } else {
      if (!(moduleName in allowed) || !(allowed[moduleName as keyof typeof allowed] as readonly string[]).includes(action)) throw new Error("Unknown business action.");
      const rpc = ({ inventory: "manage_inventory", finance: "manage_finance", settings: "manage_settings", order: "manage_order" } as const)[moduleName as keyof typeof allowed];
      ({ error } = await supabase.rpc(rpc, { p_shop_id: shop.id, p_action: action, p_data: data, p_operation_id: operationId }));
    }
    if (error) {
      console.error("business_command_failed", { module: moduleName, action, code: error.code });
      // Domain validation messages contain no credentials or raw SQL internals.
      throw new Error(error.code === "P0001" || error.code === "42501" ? error.message : error.code === "23505" ? "This record or open shift already exists." : "The change was rejected. Check required fields, shop records, and applied migrations.");
    }
    revalidatePath("/app", "layout");
    return { status: "success", message: "Saved to Supabase." };
  } catch (failure) {
    return { status: "error", message: failure instanceof Error ? failure.message : "The change could not be saved." };
  }
}
