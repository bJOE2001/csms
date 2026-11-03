import { expect, test, type Page } from "@playwright/test";
import type { Product } from "../../src/lib/menu/domain";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const longName = "RoasterySignatureBlend".repeat(5);
const catalog: Product[] = [
  { id: uid(2), name: "[Demo] Americano", price_cents: 11000, cost_cents: 3500, active: true, sizes: [
    { id: uid(3), label: "12 oz", price_cents: 11000, cost_cents: 3500, active: true, is_default: true },
    { id: uid(4), label: "16 oz", price_cents: 13000, cost_cents: 4000, active: true, is_default: false },
  ] },
  { id: uid(5), name: longName, price_cents: 14500, cost_cents: 5000, active: true, sizes: [
    { id: uid(6), label: "ExtraLargeCustomServingWithoutBreaks", price_cents: 14500, cost_cents: 5000, active: true, is_default: true },
  ] },
  { id: uid(7), name: "Large amount", price_cents: 100000000, cost_cents: 5000, active: true },
  ...Array.from({ length: 12 }, (_, index) => ({ id: uid(10 + index), name: `Pastry ${index + 1}`, price_cents: 5000, cost_cents: 2000, active: true })),
];
async function add(page: Page, name: string, size?: string) {
  await page.getByRole("searchbox", { name: "Search products" }).fill(name);
  const card = page.getByRole("article", { name, exact: true });
  if (size) await card.getByRole("radio", { name: size, exact: true }).check();
  await card.getByRole("button", { name: /Add to cart/ }).click();
}
async function assertFits(page: Page, phase: string) {
  const cart = page.locator(".pos-cart"), body = cart.locator(".cart-body");
  // Check actual scrollable content, including invisible descendants; clipping would not pass.
  for (const owner of [cart, body]) {
    const metrics = await owner.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    expect(metrics.scroll, `${phase}: horizontal content width`).toBeLessThanOrEqual(metrics.client);
  }
  expect(await body.evaluate(el => getComputedStyle(el).overflowX)).not.toMatch(/hidden|clip/);
  const region = (await body.boundingBox())!;
  for (const control of await body.locator(".order-controls button, .order-remove").all()) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x, `${phase}: control left`).toBeGreaterThanOrEqual(region.x - 1);
    expect(bounds.x + bounds.width, `${phase}: control right`).toBeLessThanOrEqual(region.x + region.width + 1);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
}
for (const viewport of [
  { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1032, height: 1376 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 320, height: 720 }, { width: 812, height: 375 },
]) {
  test(`cart fits horizontally and scrolls vertically at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const mutations: unknown[] = [];
    await page.route("**/api/pos", route => {
      if (route.request().method() !== "GET") mutations.push(route.request().postDataJSON());
      return route.fulfill({ json: { shop: { id: uid(1), name: "Coffee Logo" }, user_id: uid(1), founder: true, categories: [], products: catalog } });
    });
    await page.goto("/pos");
    await expect(page.getByRole("heading", { name: "Product menu", exact: true })).toBeVisible();
    const compact = viewport.width < 1280;
    const open = async () => { if (compact) await page.getByRole("button", { name: /^Open cart/ }).click(); };
    const close = async () => { if (compact) await page.getByRole("button", { name: "Close cart", exact: true }).click(); };
    await open();
    await expect(page.locator(".cart-empty")).toBeVisible();
    await assertFits(page, "empty");
    await close();
    await add(page, "[Demo] Americano");
    await open();
    for (let i = 1; i < 11; i++) await page.getByRole("button", { name: "Increase [Demo] Americano 12 oz", exact: true }).press("Enter");
    await expect(page.locator(".pos-total")).toContainText("₱1,210.00");
    await assertFits(page, "single sized item, quantity 11");
    await page.locator(".pos-cart").screenshot({ path: info.outputPath(`cart-single-${viewport.width}.png`), animations: "disabled" });
    await close();
    await add(page, "[Demo] Americano", "16 oz");
    await add(page, longName);
    await add(page, "Large amount");
    for (let i = 1; i <= 12; i++) await add(page, `Pastry ${i}`);
    await open();
    const increase = page.getByRole("button", { name: "Increase Large amount", exact: true });
    for (let i = 1; i < 100; i++) await increase.press("Enter");
    await expect(increase).toBeDisabled();
    await expect(page.locator(".order-line").filter({ hasText: "Large amount" }).locator(".order-line-total")).toHaveText("₱100,000,000.00");
    await expect(page.locator(".pos-total")).toContainText("₱100,002,085.00");
    await expect(page.locator(".order-line")).toHaveCount(16);
    await assertFits(page, "long text, multiple sizes, quantity 100, large totals");
    const body = page.locator(".cart-body"), checkout = page.getByRole("button", { name: "Place an order", exact: true });
    if (viewport.height > 700) await body.evaluate(el => { el.scrollTop = 0; });
    await page.locator(".pos-cart").screenshot({ path: info.outputPath(`cart-filled-${viewport.width}.png`), animations: "disabled" });
    if (viewport.height > 700) {
      const before = await checkout.boundingBox();
      await body.hover();
      await page.mouse.wheel(0, 12000);
      await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      expect(await checkout.boundingBox()).toEqual(before);
      await expect(checkout).toBeInViewport();
      await expect(page.getByLabel("Cash received", { exact: true })).toBeInViewport();
    } else {
      await checkout.scrollIntoViewIfNeeded();
      await expect(checkout).toBeInViewport();
      expect(await page.locator(".pos-cart").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    await assertFits(page, "after vertical scroll");
    await page.locator(".pos-cart").screenshot({ path: info.outputPath(`cart-long-${viewport.width}.png`), animations: "disabled" });
    await page.getByRole("button", { name: "Remove Large amount from cart", exact: true }).click();
    await expect(page.locator(".pos-total")).toContainText("₱2,085.00");
    await page.getByRole("button", { name: "Remove [Demo] Americano 12 oz from cart", exact: true }).click();
    await expect(page.locator(".pos-total")).toContainText("₱875.00");
    await expect(page.locator(".order-line").filter({ hasText: "Size: 16 oz" }).locator(".order-controls > span")).toHaveText("1");
    await assertFits(page, "after removal");
    expect(mutations).toHaveLength(0);
  });
}
