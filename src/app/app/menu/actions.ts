"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFounder } from "@/lib/auth/require-founder";
import { categoryInputSchema, productInputSchema, variantInputSchema, priceInputSchema, ingredientInputSchema, estimateInputSchema, recipeInputSchema } from "@/lib/menu/domain";
import type { ActionState } from "@/lib/menu/action-state";

function invalid(message = "Check the required fields and try again."): ActionState {
  return { status: "error", message };
}

function finish(error: { code: string } | null, message: string): ActionState {
  if (error) {
    if (error.code === "23505") return invalid("That record already exists. Use a different name or remove duplicate recipe ingredients.");
    if (error.code === "42501") return invalid("Founder access is required. Sign in again if your permissions changed.");
    if (error.code === "23503") return invalid("A selected record does not belong to this shop. Refresh and try again.");
    return invalid("The change could not be saved. Refresh and check the selected records and applied database migrations.");
  }
  revalidatePath("/app/menu");
  revalidatePath("/app/recipes");
  revalidatePath("/app");
  return { status: "success", message };
}

export async function createCategory(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = categoryInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { error } = await supabase.rpc("create_menu_category", { p_shop_id: shop.id, p_name: input.data.name });
  return finish(error, "Category created.");
}

export async function createProduct(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = productInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { category_id, product_name, variant_name, price } = input.data;
  const { error } = await supabase.rpc("create_menu_product", { p_shop_id: shop.id, p_category_id: category_id, p_name: product_name, p_variant_name: variant_name, p_price_cents: price });
  return finish(error, "Product and initial price version created. Publish its recipe before enabling it.");
}

export async function addVariant(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = variantInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { error } = await supabase.rpc("add_menu_variant", { p_shop_id: shop.id, p_product_id: input.data.product_id, p_name: input.data.variant_name, p_price_cents: input.data.price });
  return finish(error, "Variant created with price version 1.");
}

export async function publishPrice(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = priceInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { error } = await supabase.rpc("publish_product_price", { p_shop_id: shop.id, p_variant_id: input.data.variant_id, p_price_cents: input.data.price });
  return finish(error, "New price version published. Earlier versions are preserved.");
}

export async function setAvailability(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = z.object({ variant_id: z.uuid(), available: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(form));
  if (!input.success) return invalid();
  const available = input.data.available === "true";
  const { error } = await supabase.rpc("set_variant_available", { p_shop_id: shop.id, p_variant_id: input.data.variant_id, p_available: available });
  return finish(error, available ? "Variant enabled for the menu." : "Variant disabled.");
}

export async function createIngredient(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = ingredientInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { name, base_unit, estimated_unit_cost_php, minimum_stock } = input.data;
  const { error } = await supabase.rpc("create_ingredient", { p_shop_id: shop.id, p_name: name, p_base_unit: base_unit, p_estimated_unit_cost_cents: estimated_unit_cost_php, p_minimum_stock: minimum_stock });
  return finish(error, "Ingredient created. No stock was added.");
}

export async function reviseEstimate(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  const input = estimateInputSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return invalid(input.error.issues[0].message);
  const { error } = await supabase.rpc("revise_ingredient_estimate", { p_shop_id: shop.id, p_ingredient_id: input.data.ingredient_id, p_estimated_unit_cost_cents: input.data.estimated_unit_cost_php });
  return finish(error, "Ingredient estimate revised. Existing recipe snapshots retain their earlier estimates.");
}

export async function publishRecipe(_previous: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, shop } = await requireFounder();
  let items: unknown;
  const rawItems = form.get("items");
  if (typeof rawItems !== "string" || rawItems.length > 20000) return invalid("Recipe input is missing or too large.");
  try { items = JSON.parse(rawItems); } catch { return invalid("Recipe ingredients could not be read. Refresh and try again."); }
  const input = recipeInputSchema.safeParse({ variant_id: form.get("variant_id"), items });
  if (!input.success) return invalid(input.error.issues[0].message);
  const { error } = await supabase.rpc("publish_recipe", { p_shop_id: shop.id, p_variant_id: input.data.variant_id, p_items: input.data.items });
  return finish(error, "New recipe version published with a cost snapshot. Earlier versions are preserved.");
}
