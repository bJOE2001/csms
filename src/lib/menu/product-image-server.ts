import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Product } from "./domain";
import { MAX_PRODUCT_IMAGE_BYTES } from "./image-upload";

const BUCKET = "product-images";
export class ProductImageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Decode the complete raster, not just its extension, MIME type or metadata. */
export async function validateProductImage(file: File) {
  if (!file.size || file.size > MAX_PRODUCT_IMAGE_BYTES)
    throw new ProductImageError("Choose a non-empty image of at most 5 MB.", file.size ? 413 : 400);
  const bytes = Buffer.from(await file.arrayBuffer());
  // Restrict the decoder before inspecting metadata, excluding SVG and other parsers.
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) throw new ProductImageError("Only genuine JPG, PNG, and WebP images are supported.");
  const extension = png ? "png" : jpeg ? "jpg" : "webp";
  try {
    const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: 20_000_000 });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1)
      throw Error("Invalid or animated image");
    await decoder.raw().toBuffer();
  } catch {
    throw new ProductImageError("This image could not be read. Choose a valid, still JPG, PNG, or WebP image up to 20 megapixels.");
  }
  return { bytes, extension, contentType: jpeg ? "image/jpeg" : `image/${extension}` };
}

/** Upload only during a validated save. Previous images are retained for history. */
export async function saveProductWithImage(db: SupabaseClient<Database>, userId: string,
  shopId: string, product: Omit<Product, "id"> & { id?: string }, file: File) {
  const { data: member, error: accessError } = await db.from("shop_members")
    .select("role").eq("shop_id", shopId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (accessError) throw new ProductImageError("Shop permissions could not be checked. Try again.", 503);
  if (member?.role !== "founder") throw new ProductImageError("Only the shop owner can manage product images.", 403);
  const image = await validateProductImage(file);
  if (!product.id) throw new ProductImageError("A product ID is required. Reopen the product form and try again.");
  const productId = product.id;
  const key = `${shopId.toLowerCase()}/${productId.toLowerCase()}/${randomUUID()}.${image.extension}`;
  const storage = db.storage.from(BUCKET);
  const cleanup = async () => {
    try {
      const { error } = await storage.remove([key]);
      if (error) console.error("Product image cleanup failed", { key, code: error.name });
    } catch {
      console.error("Product image cleanup could not be confirmed", { key });
    }
  };
  let uploaded = false;
  try {
    uploaded = !(await storage.upload(key, image.bytes,
      { contentType: image.contentType, cacheControl: "31536000", upsert: false })).error;
  } catch {
    // Storage may have received the file even when its response was lost.
  }
  if (!uploaded) {
    await cleanup();
    throw new ProductImageError("Image upload is unavailable. Try again or use Image URL. Your product has not changed.", 503);
  }
  const imageUrl = storage.getPublicUrl(key).data.publicUrl;
  const result = await db.rpc("pos_save_product", { p_shop_id: shopId,
    p_data: { ...product, id: productId, image_url: imageUrl } });
  // A PostgreSQL error confirms transaction rollback. Transport failures can be
  // ambiguous: retain the object rather than delete an image a committed save uses.
  if (result.error && (/^[0-9A-Z]{5}$/.test(result.error.code ?? "") || result.error.code === "PGRST202")) await cleanup();
  if (result.error && !result.error.code)
    throw new ProductImageError("Product save could not be confirmed. Refresh Menu before retrying.", 503);
  return result;
}
