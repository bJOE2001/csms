import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "@/lib/http";
import {
  checkoutSchema,
  productSchema,
  expenseSchema,
  recordCostSchema,
} from "@/lib/sales/domain";
import { categorySchema } from "@/lib/menu/domain";
import { updateExpenseSchema } from "@/lib/expenses/domain";
import { MAX_PRODUCT_IMAGE_BYTES } from "@/lib/menu/image-upload";
import { ProductImageError, saveProductWithImage } from "@/lib/menu/product-image-server";
export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in to open POS." },
      { status: 401 },
    );
  const { data: member, error: accessError } = await db
    .from("shop_members")
    .select("shop_id,role,shops(id,name,timezone)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (accessError)
    return NextResponse.json(
      { error: "Shop access could not be loaded." },
      { status: 503 },
    );
  if (!member)
    return NextResponse.json(
      { error: "Create your shop first." },
      { status: 403 },
    );
  const [{ data, error }, { data: categories, error: categoryError }] =
    await Promise.all([
      db
        .from("pos_products")
        .select(
          "id,name,price_cents,cost_cents,active,category_id,description,image_url,sizes",
        )
        .eq("shop_id", member.shop_id)
        .is("archived_at", null)
        .order("name"),
      db
        .from("pos_categories")
        .select("id,name")
        .eq("shop_id", member.shop_id)
        .order("name"),
    ]);
  return error || categoryError
    ? NextResponse.json(
        {
          error:
            "Apply the Menu Management migration before opening your shop.",
        },
        { status: 503 },
      )
    : NextResponse.json(
        {
          shop: member.shops,
          user_id: user.id,
          founder: member.role === "founder",
          products: data,
          categories,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
}
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, process.env.APP_URL))
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const multipart = request.headers.get("content-type")?.startsWith("multipart/form-data");
  const bodyLimit = multipart ? MAX_PRODUCT_IMAGE_BYTES + 32768 : 32768;
  if (Number(request.headers.get("content-length")) > bodyLimit)
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Sign in again. Your pending sale remains saved." },
      { status: 401 },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > bodyLimit) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Request too large" },
          { status: 413 },
        );
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let payload: unknown;
    let image: File | undefined;
    if (multipart) {
      const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
      const json = form.get("payload");
      const file = form.get("image");
      if (typeof json !== "string" || new TextEncoder().encode(json).length > 32768 || !(file instanceof File))
        throw new ProductImageError("Choose a product image and check the product details.");
      payload = JSON.parse(json);
      image = file;
    } else payload = JSON.parse(new TextDecoder().decode(bytes));
    const body = z
      .object({
        action: z.enum([
          "checkout",
          "product",
          "refund",
          "expense",
          "update_expense",
          "void_expense",
          "record_cost",
          "category",
          "delete_category",
          "archive_product",
        ]),
        shop_id: z.uuid(),
        data: z.unknown(),
      })
      .parse(payload);
    if (multipart && body.action !== "product")
      throw new ProductImageError("Image uploads are supported only for product saves.");
    let result;
    if (body.action === "checkout")
      result = await db.rpc("pos_checkout", {
        p_shop_id: body.shop_id,
        p_data: checkoutSchema.parse(body.data),
      });
    else if (body.action === "product") {
      const product = productSchema.parse(body.data);
      result = image ? await saveProductWithImage(db, user.id, body.shop_id, product, image)
        : await db.rpc("pos_save_product", { p_shop_id: body.shop_id, p_data: product });
    }
    else if (body.action === "category")
      result = await db.rpc("pos_save_category", {
        p_shop_id: body.shop_id,
        p_data: categorySchema.parse(body.data),
      });
    else if (
      body.action === "archive_product" ||
      body.action === "delete_category"
    )
      result = await db.rpc(
        body.action === "archive_product"
          ? "pos_archive_product"
          : "pos_delete_category",
        {
          p_shop_id: body.shop_id,
          p_id: z.object({ id: z.uuid() }).parse(body.data).id,
        },
      );
    else if (body.action === "expense")
      result = await db.rpc("pos_add_expense", {
        p_shop_id: body.shop_id,
        p_data: expenseSchema.parse(body.data),
      });
    else if (body.action === "update_expense")
      result = await db.rpc("pos_update_expense", {
        p_shop_id: body.shop_id,
        p_data: updateExpenseSchema.parse(body.data),
      });
    else if (body.action === "record_cost")
      result = await db.rpc("pos_record_cost", {
        p_shop_id: body.shop_id,
        p_data: recordCostSchema.parse(body.data),
      });
    else if (body.action === "void_expense") {
      const expense = z.object({ id: z.uuid() }).parse(body.data);
      result = await db.rpc("pos_void_expense", {
        p_shop_id: body.shop_id,
        p_id: expense.id,
      });
    } else {
      const refund = z
        .object({ id: z.uuid(), reason: z.string().trim().min(1).max(500) })
        .parse(body.data);
      result = await db.rpc("pos_refund", {
        p_shop_id: body.shop_id,
        p_sale_id: refund.id,
        p_reason: refund.reason,
      });
    }
    if (result.error)
      return NextResponse.json(
        {
          error:
            body.action === "update_expense" && result.error.code === "PGRST202"
              ? "Apply the Expenses Management migration before editing expenses."
              : result.error.code === "P0001" || result.error.code === "42501"
                ? result.error.message
                : "The request could not be saved. Retry with the same details.",
        },
        { status: 422 },
      );
    if (["expense", "update_expense", "void_expense"].includes(body.action)) {
      revalidatePath("/expenses");
      revalidatePath("/app/sales");
    }
    return NextResponse.json(
      { data: result.data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof ProductImageError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      { error: "Check the product, expense or payment details." },
      { status: 400 },
    );
  }
}
