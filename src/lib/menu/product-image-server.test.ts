import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { MAX_PRODUCT_IMAGE_BYTES, productImageFileError } from "./image-upload";
import { validateProductImage } from "./product-image-server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), getUser: vi.fn(), member: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: mocks.getUser }, rpc: mocks.rpc,
  from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: mocks.member };
    return query;
  },
  storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove,
    getPublicUrl: (key: string) => ({ data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/product-images/${key}` } }),
  }) },
}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { POST } from "@/app/api/pos/route";

const id = "00000000-0000-4000-8000-000000000001";
const product = { id, name: "Latte", price_cents: 14500, active: true, image_url: "https://example.com/old.png" };
let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#75442d" } }).png().toBuffer(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id } } });
  mocks.member.mockResolvedValue({ data: { role: "founder" }, error: null });
  mocks.rpc.mockResolvedValue({ data: product, error: null });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
});
function request(file: File, data: unknown = product, action = "product", origin = "http://localhost:3000") {
  const body = new FormData();
  body.set("payload", JSON.stringify({ action, shop_id: id, data }));
  body.set("image", file);
  return new NextRequest("http://localhost:3000/api/pos", { method: "POST", body,
    headers: { host: "localhost:3000", origin } });
}
const image = () => new File([new Uint8Array(png)], "../../dangerous.svg", { type: "application/octet-stream" });

describe("product image validation", () => {
  it.each(["jpeg", "png", "webp"] as const)("fully decodes %s and preserves source bytes", async format => {
    const bytes = await sharp(png).toFormat(format).toBuffer();
    const result = await validateProductImage(new File([new Uint8Array(bytes)], "fake.exe", { type: "text/plain" }));
    expect(result.bytes.equals(bytes)).toBe(true);
    expect(result.contentType).toBe(`image/${format}`);
  });
  it.each(["<svg xmlns='http://www.w3.org/2000/svg' />", "MZ executable", "GIF89a", "\x89PNG\r\n\x1a\n"])("rejects spoofed or corrupt files", async content => {
    await expect(validateProductImage(new File([content], "photo.png", { type: "image/png" }))).rejects.toThrow();
  });
  it("rejects empty, oversized and decompression-heavy images", async () => {
    await expect(validateProductImage(new File([], "empty.jpg"))).rejects.toThrow("non-empty");
    await expect(validateProductImage(new File([new Uint8Array(MAX_PRODUCT_IMAGE_BYTES + 1)], "huge.jpg"))).rejects.toThrow("5 MB");
    const huge = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "white" } }).png().toBuffer();
    await expect(validateProductImage(new File([new Uint8Array(huge)], "pixels.png"))).rejects.toThrow("20 megapixels");
  });
  it("validates size and MIME in the browser without relying on the filename", () => {
    expect(productImageFileError({ size: MAX_PRODUCT_IMAGE_BYTES, type: "image/webp" })).toBe("");
    expect(productImageFileError({ size: MAX_PRODUCT_IMAGE_BYTES + 1, type: "image/jpeg" })).toContain("5 MB");
    expect(productImageFileError({ size: 1, type: "image/svg+xml" })).toContain("not supported");
  });
});

describe("authenticated product uploads", () => {
  it("saves a unique shop/product key through the existing product RPC", async () => {
    expect((await POST(request(image()))).status).toBe(200);
    const [key, bytes, options] = mocks.upload.mock.calls[0];
    expect(key).toMatch(new RegExp(`^${id}/${id}/[0-9a-f-]{36}\\.png$`));
    expect(bytes.equals(png)).toBe(true);
    expect(options).toMatchObject({ contentType: "image/png", upsert: false });
    expect(mocks.rpc).toHaveBeenCalledWith("pos_save_product", { p_shop_id: id,
      p_data: { ...product, image_url: `https://project.supabase.co/storage/v1/object/public/product-images/${key}` } });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each([null, { role: "staff" }])("rejects missing/insufficient shop permissions", async member => {
    mocks.member.mockResolvedValue({ data: member, error: null });
    expect((await POST(request(image()))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-origin requests", async () => {
    expect((await POST(request(image(), product, "product", "https://attacker.invalid"))).status).toBe(403);
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request(image()))).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("validates product details before uploading and excludes non-product actions", async () => {
    expect((await POST(request(image(), { ...product, name: "" }))).status).toBe(400);
    expect((await POST(request(image(), product, "checkout"))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies even without a Content-Length header", async () => {
    const multipart = request(new File([new Uint8Array(MAX_PRODUCT_IMAGE_BYTES + 40000)], "huge.png"));
    // Finish undici's async FormData producer before the route cancels this
    // oversized fixture; cancellation otherwise leaves a late enqueue behind.
    const body = await multipart.arrayBuffer();
    const oversized = new NextRequest(multipart.url, { method: "POST", headers: multipart.headers, body });
    expect(oversized.headers.has("content-length")).toBe(false);
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not save the product when upload fails", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "Bucket missing" } });
    const response = await POST(request(image()));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("use Image URL");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
  it("requires a stable product ID for upload retries", async () => {
    expect((await POST(request(image(), { ...product, id: undefined }))).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("cleans only the new image after a confirmed rollback", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001", message: "Category was removed" } });
    expect((await POST(request(image()))).status).toBe(422);
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0][0]]);
  });
  it("retains the new image when a save may have committed", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "", message: "Network interrupted" } });
    expect((await POST(request(image()))).status).toBe(503);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("keeps JSON URL-based product saves unchanged", async () => {
    const body = JSON.stringify({ action: "product", shop_id: id, data: product });
    const response = await POST(new NextRequest("http://localhost:3000/api/pos", { method: "POST", body,
      headers: { origin: "http://localhost:3000", host: "localhost:3000", "content-type": "application/json" } }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("pos_save_product", { p_shop_id: id, p_data: product });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
