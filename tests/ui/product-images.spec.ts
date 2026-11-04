import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

const id = "00000000-0000-4000-8000-000000000001";
const legacy = "https://images.example.test/old-latte.png";
async function setup(page: Page) {
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#75442d" } }).png().toBuffer();
  const products = [{ id, name: "Latte", price_cents: 14500, cost_cents: 5000, active: true,
    description: "Coffee", category_id: null, image_url: legacy, sizes: [] }];
  const calls: { data: Record<string, unknown>; file?: { name: string; type: string; size: number } }[] = [];
  const state = { fail: false, hold: undefined as Promise<void> | undefined };
  await page.route("https://images.example.test/**", route => route.fulfill({ contentType: "image/png", body: bytes }));
  await page.route("https://project.supabase.co/storage/**", route => route.fulfill({ contentType: "image/png", body: bytes }));
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      shop: { id, name: "LOGO Coffee" }, user_id: id, founder: true, products, categories: [],
    } });
    const type = route.request().headers()["content-type"];
    let payload;
    let file: File | undefined;
    if (type.startsWith("multipart/form-data")) {
      const form = await new Response(new Uint8Array(route.request().postDataBuffer()!), { headers: { "content-type": type } }).formData();
      payload = JSON.parse(String(form.get("payload")));
      file = form.get("image") as File;
    } else payload = route.request().postDataJSON();
    calls.push({ data: payload.data, file: file ? { name: file.name, type: file.type, size: file.size } : undefined });
    if (state.hold) await state.hold;
    if (state.fail) return route.fulfill({ status: 503, json: { error: "Image upload unavailable. Try again." } });
    const next = { ...payload.data, image_url: file
      ? `https://project.supabase.co/storage/v1/object/public/product-images/${id}/${payload.data.id}/new.png`
      : payload.data.image_url };
    const existing = products.find(product => product.id === next.id);
    if (existing) Object.assign(existing, next); else products.push(next);
    await route.fulfill({ json: { data: next } });
  });
  await page.goto("/menu");
  await expect(page.getByRole("heading", { name: "Menu Management", exact: true })).toBeVisible();
  const file = { name: "latte.png", mimeType: "image/png", buffer: bytes };
  return { calls, products, state, file };
}
const dialog = (page: Page) => page.getByRole("dialog");
const picker = (page: Page) => dialog(page).getByLabel("Choose product image", { exact: true });
async function add(page: Page) {
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await dialog(page).getByLabel("Product name", { exact: true }).fill("Mocha");
  await dialog(page).getByLabel("Selling price (PHP)", { exact: true }).fill("160");
  await dialog(page).getByLabel("Cost per item (PHP)", { exact: true }).fill("50");
}
async function edit(page: Page, name = "Latte") {
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
}
const save = (page: Page) => dialog(page).getByRole("button", { name: "Save product", exact: true }).click();

test("upload drafts preview, replace and remove locally, then save into listing, POS and cart", async ({ page }) => {
  const data = await setup(page);
  await add(page);
  await expect(dialog(page).getByRole("radio", { name: "Upload Image", exact: true })).toBeChecked();
  await expect(dialog(page).getByText("Upload a product image", { exact: true })).toBeVisible();
  await picker(page).setInputFiles(data.file);
  await expect(dialog(page).getByRole("img", { name: "Product image preview" })).toHaveAttribute("src", /^blob:/);
  await picker(page).setInputFiles({ ...data.file, name: "replacement.png" });
  await expect(dialog(page).getByText("replacement.png", { exact: true })).toBeVisible();
  await dialog(page).getByRole("button", { name: "Remove Image", exact: true }).click();
  await expect(dialog(page).getByRole("img")).toHaveCount(0);
  expect(data.calls).toHaveLength(0);
  await picker(page).setInputFiles(data.file);
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls[0].file).toEqual({ name: "latte.png", type: "image/png", size: data.file.buffer.length });
  const uploaded = data.products.find(product => product.name === "Mocha")!;
  await expect(page.getByRole("row").filter({ hasText: "Mocha" }).locator("img")).toHaveAttribute("src", uploaded.image_url);
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.goto("/pos");
  const card = page.locator(".product-card").filter({ hasText: "Mocha" });
  await expect(card.locator("img")).toHaveAttribute("src", uploaded.image_url);
  await card.getByRole("button", { name: /Add to cart/ }).click();
  await page.getByRole("button", { name: "Open cart, 1 items", exact: true }).click();
  const cart = page.getByRole("dialog", { name: "Cart", exact: true });
  await expect(cart.locator(".order-line img")).toHaveAttribute("src", uploaded.image_url);
  await expect(cart.locator(".pos-total")).toContainText("160.00");
});

test("editing preserves legacy images unchanged and supports URL replacement and removal", async ({ page }) => {
  const data = await setup(page);
  await edit(page);
  await expect(dialog(page).getByRole("img")).toHaveAttribute("src", legacy);
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls[0]).toMatchObject({ data: { image_url: legacy }, file: undefined });
  await edit(page);
  await dialog(page).getByRole("radio", { name: "Image URL", exact: true }).check();
  await dialog(page).getByLabel("Product image URL", { exact: true }).fill("javascript:alert(1)");
  await save(page);
  await expect(dialog(page).locator(".product-image-upload [role=alert]")).toContainText("HTTPS");
  expect(data.calls).toHaveLength(1);
  await dialog(page).getByLabel("Product image URL", { exact: true }).fill("https://images.example.test/new.png");
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.products[0].image_url).toBe("https://images.example.test/new.png");
  await edit(page);
  await dialog(page).getByRole("button", { name: "Remove Image", exact: true }).click();
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.products[0].image_url).toBe(null);
  await expect(page.locator(".menu-product-identity img")).toHaveCount(0);
});

test("failed uploads preserve the old image and selected draft for retry", async ({ page }) => {
  const data = await setup(page);
  await edit(page);
  await picker(page).setInputFiles(data.file);
  data.state.fail = true;
  await save(page);
  await expect(dialog(page).getByRole("alert")).toContainText("Image upload unavailable");
  expect(data.products[0].image_url).toBe(legacy);
  await expect(dialog(page).getByRole("img")).toHaveAttribute("src", /^blob:/);
  await expect(dialog(page).getByLabel("Product name", { exact: true })).toHaveValue("Latte");
  data.state.fail = false;
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls[0].data.id).toBe(data.calls[1].data.id);
  expect(data.products[0].image_url).toContain("product-images");
});

test("unsupported, oversized and empty files show errors and never submit", async ({ page }) => {
  const data = await setup(page);
  await add(page);
  for (const file of [
    { name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") },
    { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
    { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) },
  ]) {
    await picker(page).setInputFiles(file);
    await expect(dialog(page).locator(".product-image-upload [role=alert]")).toBeVisible();
    await save(page);
    await expect(dialog(page).locator(".form-message.error")).toBeVisible();
    expect(data.calls).toHaveLength(0);
  }
  await picker(page).setInputFiles(data.file);
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls).toHaveLength(1);
});

test("discarding a selected image makes no upload and a fresh draft is empty", async ({ page }) => {
  const data = await setup(page);
  await add(page);
  await picker(page).setInputFiles(data.file);
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls).toHaveLength(0);
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(dialog(page).getByText("Upload a product image", { exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("img")).toHaveCount(0);
});

test("drag and drop works and pending saves disable duplicate changes", async ({ page }) => {
  const data = await setup(page);
  await edit(page);
  const transfer = await page.evaluateHandle(bytes => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], "dropped.png", { type: "image/png" }));
    return transfer;
  }, Array.from(data.file.buffer));
  await dialog(page).locator(".product-image-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog(page).getByText("dropped.png", { exact: true })).toBeVisible();
  let release = () => {};
  data.state.hold = new Promise<void>(resolve => { release = resolve; });
  await save(page);
  await expect(dialog(page).getByRole("button", { name: /Saving/ })).toBeDisabled();
  await expect(dialog(page).getByRole("button", { name: "Replace Image", exact: true })).toBeDisabled();
  await expect.poll(() => data.calls.length).toBe(1);
  release();
  await expect(dialog(page)).toHaveCount(0);
  await transfer.dispose();
});

test("image controls and previews fit desktop, tablet and mobile dialogs", async ({ page }, info) => {
  test.setTimeout(120000);
  const data = await setup(page);
  for (const width of [1440, 1280, 1032, 768, 393]) {
    await page.setViewportSize({ width, height: 900 });
    await edit(page);
    await picker(page).setInputFiles(data.file);
    const preview = dialog(page).getByRole("img");
    await expect(preview).toHaveCSS("object-fit", "cover");
    await expect(preview).toBeVisible();
    const replace = dialog(page).getByRole("button", { name: "Replace Image", exact: true });
    for (const button of [replace, dialog(page).getByRole("button", { name: "Remove Image", exact: true })]) {
      const contrast = await button.evaluate(node => {
        const css = getComputedStyle(node);
        let background = css.backgroundColor;
        let ancestor: Element | null = node;
        while (background === "rgba(0, 0, 0, 0)" && (ancestor = ancestor.parentElement))
          background = getComputedStyle(ancestor).backgroundColor;
        const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
          .map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
          .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const foreground = luminance(css.color), surface = luminance(background);
        return (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await replace.scrollIntoViewIfNeeded();
    await expect(replace).toBeInViewport();
    await page.keyboard.press("Tab");
    await replace.focus();
    await expect(replace).toHaveCSS("outline-style", "solid");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = (await dialog(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`upload-${width}.png`) });
    await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Discard changes", exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
  }
});

test("an optional empty image keeps the existing neutral placeholder", async ({ page }) => {
  const data = await setup(page);
  await add(page);
  await save(page);
  await expect(dialog(page)).toHaveCount(0);
  expect(data.calls[0]).toMatchObject({ data: { image_url: null }, file: undefined });
  await expect(page.getByRole("row").filter({ hasText: "Mocha" }).locator("img")).toHaveCount(0);
});
