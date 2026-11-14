import { expect, test, type Page } from "@playwright/test";
import type { PublicMenu, PublicProduct } from "../../src/lib/site/public-menu";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const longDescription = `${"A leisurely coffee moment with friends. ".repeat(22)}The complete description stays available.`;
function products(): PublicProduct[] {
  return [
    { id: id(1), name: "House Latte", category: "Coffee", description: "Espresso with milk.", price: 12000, image: "/site/iced-coffee.webp", sizes: [{ label: "12 oz", price: 12000 }, { label: "16 oz", price: 14500 }] },
    { id: id(2), name: "Americano", category: "Coffee", description: "", price: 9500, image: null, sizes: [] },
    { id: id(3), name: "A very long seasonal coffee selection with a name that should remain readable on every screen", category: "Non-Coffee", description: longDescription, price: 11000, image: "/site/coffee-moment.webp", sizes: [{ label: "A generously named size that wraps without hiding its price", price: 11000 }, { label: "Regular", price: 11000 }] },
    { id: id(4), name: "Cake", category: "Desserts", description: "Recorded description.", price: 8500, image: null, sizes: [] },
    { id: id(5), name: "Sandwich", category: "Food", description: "Recorded description.", price: 10000, image: null, sizes: [] },
    { id: id(6), name: "Cookie", category: "Snacks", description: "Recorded description.", price: 4500, image: null, sizes: [] },
  ];
}
async function catalog(page: Page, records = products()) {
  const menu: PublicMenu = { status: "published", products: records };
  await page.addInitScript(value => sessionStorage.setItem("fixture-public-menu", JSON.stringify(value)), menu);
  return menu;
}

test("shared cards preserve prices, size labels, image references and full descriptions in accessible details", async ({ page }, info) => {
  test.setTimeout(90_000);
  const menu = await catalog(page);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 393, height: 852 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/menu");
    await page.evaluate(() => document.fonts.ready);
    const latte = page.locator(`#product-${id(1)}`);
    await expect(latte.locator(".site-product-meta > strong")).toHaveText("From ₱120.00");
    await expect(page.locator(`#product-${id(2)} .site-product-meta > strong`)).toHaveText("₱95.00");
    const long = page.locator(`#product-${id(3)}`);
    await expect(long.locator(".site-product-meta > strong")).toHaveText("₱110.00");
    await expect(long.getByRole("heading")).toHaveText(menu.products[2].name);
    await expect(long.getByRole("list")).toContainText(menu.products[2].sizes[0].label);
    expect(await long.locator(".site-product-description").evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const photo = latte.getByRole("img", { name: "House Latte", exact: true });
    await expect(photo).toHaveAttribute("src", menu.products[0].image!);
    await expect(photo).toHaveCSS("object-fit", "contain");
    const action = long.getByRole("button", { name: `View details for ${menu.products[2].name}`, exact: true });
    await action.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: menu.products[2].name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".site-product-detail-copy > p")).toHaveText(longDescription);
    await expect(dialog.getByRole("list")).toContainText(menu.products[2].sizes[0].label);
    await expect(dialog.getByRole("img", { name: menu.products[2].name, exact: true })).toHaveCSS("object-fit", "contain");
    await expect(dialog.locator(".site-product-meta")).toBeInViewport();
    if (viewport.width < 640) {
      const imageBounds = (await dialog.locator(".site-product-photo").boundingBox())!;
      const copyBounds = (await dialog.locator(".site-product-detail-copy").boundingBox())!;
      expect(copyBounds.y).toBeGreaterThanOrEqual(imageBounds.y + imageBounds.height);
    }
    for (let step = 0; step < 3; step++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    }
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`details-${viewport.width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(action).toBeFocused();
    await action.click();
    await page.mouse.click(8, 8);
    await expect(dialog).toHaveCount(0);
    const heading = long.getByRole("heading");
    await heading.scrollIntoViewIfNeeded();
    const headingBox = (await heading.boundingBox())!;
    await page.mouse.click(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2);
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/?landing");
  const featured = page.locator(".site-featured .site-product");
  await expect(featured).toHaveCount(4);
  await expect(page.getByRole("link", { name: `View ${menu.products[2].name} on the full menu`, exact: true })).toHaveAttribute("href", `/menu#product-${id(3)}`);
  await expect(page.locator(`.site-featured #product-${id(3)}`).getByRole("list")).toContainText("₱110.00");
  await expect(page.getByRole("button", { name: /Add to cart|Checkout|Place an order/ })).toHaveCount(0);
});

test("loading and failed images keep their frame; a refreshed image recovers without changing product data", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const records = products();
  records[0].image = "/uploads/pending-ui-image.png";
  records[1].image = "/uploads/failed-ui-image.png";
  const menu = await catalog(page, records);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/uploads/pending-ui-image.png", async route => { await gate; await route.fulfill({ path: "public/site/iced-coffee.webp", contentType: "image/webp" }); });
  await page.route("**/uploads/failed-ui-image.png", route => route.fulfill({ status: 404 }));
  await page.goto("/menu", { waitUntil: "domcontentloaded" });
  const frame = page.locator(`#product-${id(1)} .site-product-photo`);
  await expect(frame).toHaveAttribute("aria-busy", "true");
  const before = (await frame.boundingBox())!;
  release();
  await expect(frame).not.toHaveAttribute("aria-busy");
  const after = (await frame.boundingBox())!;
  expect(after.height).toBeCloseTo(before.height, 1);
  await expect(page.getByRole("img", { name: "Americano: product photo unavailable", exact: true })).toBeVisible();
  const refreshed = { ...menu, products: menu.products.map(product => product.id === id(2) ? { ...product, image: "/site/coffee-moment.webp" } : product) };
  await page.route("**/api/public-menu", route => route.fulfill({ json: refreshed }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const replacement = page.locator(`#product-${id(2)} img`);
  await expect(replacement).toHaveAttribute("src", "/site/coffee-moment.webp");
  await expect.poll(() => replacement.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("img", { name: "Americano: product photo unavailable", exact: true })).toHaveCount(0);
  await expect(page.locator(`#product-${id(2)} .site-product-meta > strong`)).toHaveText("₱95.00");
});

test("actual category controls stay keyboard reachable without page overflow on small and landscape screens", async ({ page }) => {
  await catalog(page);
  for (const viewport of [{ width: 375, height: 812 }, { width: 852, height: 393 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/menu");
    await page.evaluate(() => document.fonts.ready);
    const filters = page.getByRole("group", { name: "Browse menu by category" });
    await expect(filters.getByRole("button")).toHaveCount(6);
    const snacks = filters.getByRole("button", { name: "Snacks", exact: true });
    await snacks.focus();
    await page.keyboard.press("Enter");
    await expect(snacks).toHaveAttribute("aria-pressed", "true");
    await expect(snacks).toBeInViewport();
    await expect(snacks).toBeFocused();
    if (viewport.width < 640) {
      const control = (await snacks.boundingBox())!, frame = (await filters.boundingBox())!;
      const outline = await snacks.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) + parseFloat(getComputedStyle(el).outlineOffset));
      expect(outline).toBeGreaterThan(0);
      expect(control.x + control.width + outline).toBeLessThanOrEqual(frame.x + frame.width);
    }
    await expect(page.getByRole("status").filter({ hasText: "1 selection · Snacks" })).toBeVisible();
    await expect(page.locator(".site-product")).toHaveCount(1);
    await expect(page.locator(".site-product h3")).toHaveText("Cookie");
    await filters.getByRole("button", { name: "All selections", exact: true }).click();
    await expect(page.locator(".site-product")).toHaveCount(6);
    const search = page.getByRole("searchbox", { name: "Search menu", exact: true });
    await search.fill("Cookie");
    await expect(page.locator(".site-product")).toHaveCount(1);
    await expect(page.locator(".site-product h3")).toHaveText("Cookie");
    await search.fill("nonexistent drink");
    await expect(page.locator(".site-product")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(page.locator(".site-product")).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
