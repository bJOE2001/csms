import { expect, test, type Page } from "@playwright/test";
import type { Product } from "../../src/lib/menu/domain";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function products(): Product[] {
  return [
    { id: uid(10), name: "Cafe Latte", description: "Espresso with steamed milk.", price_cents: 13000, cost_cents: 4500, active: true, category_id: uid(2), sizes: [
      { id: uid(11), label: "12 oz", price_cents: 13000, cost_cents: 4500, active: true, is_default: true },
      { id: uid(12), label: "16 oz", price_cents: 15000, cost_cents: 5500, active: true, is_default: false },
      { id: uid(13), label: "22 oz", price_cents: 17500, cost_cents: 6500, active: false, is_default: false },
    ] },
    { id: uid(20), name: "Americano", description: "Espresso and hot water.", price_cents: 9500, cost_cents: 2800, active: true, category_id: uid(2), sizes: [
      { id: uid(21), label: "8 oz", price_cents: 9500, cost_cents: 2800, active: true, is_default: true },
    ] },
    { id: uid(30), name: "Matcha Latte", description: "Matcha and milk over ice.", price_cents: 17500, cost_cents: 7800, active: true, category_id: uid(3), sizes: [
      { id: uid(31), label: "12 oz", price_cents: 15500, cost_cents: 6500, active: true, is_default: false },
      { id: uid(32), label: "16 oz", price_cents: 17500, cost_cents: 7800, active: true, is_default: true },
    ] },
    { id: uid(40), name: "Brownie", description: "Rich chocolate, baked in our kitchen.", price_cents: 8000, cost_cents: 3200, active: true, category_id: uid(4) },
    { id: uid(50), name: "Butter Croissant", price_cents: 8500, cost_cents: 3500, active: true, category_id: uid(4) },
    { id: uid(60), name: "Oat Cookie", price_cents: 5500, cost_cents: 2000, active: true, category_id: uid(4) },
    { id: uid(70), name: "Pumpkin Spice Latte", description: "Seasonal menu item.", price_cents: 16500, cost_cents: 6000, active: false, category_id: uid(2) },
    { id: uid(80), name: "Single-origin espresso with oat milk and a double shot", description: "A longer product label with actual supporting information that wraps naturally.", price_cents: 18500, cost_cents: 6500, active: true, category_id: uid(2) },
  ];
}
async function mock(page: Page, catalog = products()) {
  const calls: { action: string; data: { items: { product_id: string; size_id?: string; quantity: number; price_cents: number }[]; method: string } }[] = [];
  await page.route("**/api/pos", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      shop: { id: uid(1), name: "Common Ground Coffee" }, user_id: uid(1), founder: true,
      categories: [{ id: uid(2), name: "Coffee" }, { id: uid(3), name: "Non-Coffee" }, { id: uid(4), name: "Food" }], products: catalog,
    } });
    const body = route.request().postDataJSON();
    calls.push(body);
    return route.fulfill({ json: { data: { id: body.data.id, total_cents: body.data.items.reduce((sum: number, item: { quantity: number; price_cents: number }) => sum + item.quantity * item.price_cents, 0) } } });
  });
  return calls;
}
const sizeGroup = (page: Page, product = "Cafe Latte") => page.getByRole("group", { name: `Size for ${product}`, exact: true });
const add = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`${name}.*Add to cart`) });
async function increaseInCart(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: /^Open cart/ });
  const drawer = await trigger.isVisible();
  if (drawer) await trigger.click();
  await page.getByRole("button", { name: `Increase ${name}`, exact: true }).click();
  if (drawer) await page.getByRole("button", { name: "Close cart", exact: true }).click();
}


test("inline sizes keep defaults, keyboard navigation and separate cart prices", async ({ page }) => {
  const calls = await mock(page);
  await page.goto("/?pos");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(sizeGroup(page).getByRole("radio", { name: "12 oz", exact: true })).toBeChecked();
  await expect(sizeGroup(page, "Americano").getByRole("radio", { name: "8 oz", exact: true })).toBeChecked();
  await expect(sizeGroup(page, "Matcha Latte").getByRole("radio", { name: "16 oz", exact: true })).toBeChecked();
  await expect(sizeGroup(page, "Brownie")).toHaveCount(0);
  await expect(sizeGroup(page).getByRole("radio", { name: "22 oz — Unavailable", exact: true })).toBeDisabled();
  await add(page, "Cafe Latte 12 oz").click();
  await increaseInCart(page, "Cafe Latte 12 oz");
  await expect(page.locator(".product-card").filter({ has: sizeGroup(page) }).locator(".product-cart-quantity")).toHaveText("2 in cart");
  await sizeGroup(page).getByRole("radio", { name: "12 oz", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true })).toBeChecked();
  await add(page, "Cafe Latte 16 oz").click();
  await expect(page.locator(".order-line")).toHaveCount(2);
  await expect(page.locator(".pos-total")).toContainText("₱410.00");
  await page.getByRole("button", { name: "GCash", exact: true }).click();
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  await expect(page.locator(".form-message.success")).toContainText("Sale complete");
  expect(calls[0].data).toMatchObject({ method: "gcash", items: [
    { product_id: uid(10), size_id: uid(11), quantity: 2, price_cents: 13000 },
    { product_id: uid(10), size_id: uid(12), quantity: 1, price_cents: 15000 },
  ] });
});

test("trash removes only its line and recalculates count, total, change and product indicator", async ({ page }) => {
  const calls = await mock(page);
  await page.goto("/?pos");
  await add(page, "Cafe Latte 12 oz").click();
  await increaseInCart(page, "Cafe Latte 12 oz");
  await sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true }).check();
  await add(page, "Cafe Latte 16 oz").click();
  await add(page, "Brownie").click();
  await page.getByLabel("Cash received", { exact: true }).fill("600");
  await expect(page.locator(".cart-change")).toContainText("₱110.00");
  await page.getByRole("button", { name: "Remove Cafe Latte 12 oz from cart", exact: true }).click();
  await expect(page.locator(".order-line")).toHaveCount(2);
  await expect(page.locator(".pos-total")).toContainText("₱230.00");
  await expect(page.locator(".cart-change")).toContainText("₱370.00");
  await expect(page.getByLabel("2 items in cart", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await sizeGroup(page).getByRole("radio", { name: "12 oz", exact: true }).check();
  await expect(page.locator(".product-card").filter({ has: sizeGroup(page) }).locator(".product-cart-quantity")).toHaveCount(0);
  await page.getByRole("button", { name: "Remove Cafe Latte 16 oz from cart", exact: true }).click();
  await expect(page.locator(".order-line")).toContainText("Brownie");
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  expect(calls).toHaveLength(1);
  expect(calls[0].data).toMatchObject({ method: "cash", items: [{ product_id: uid(40), quantity: 1, price_cents: 8000 }] });
});

test("removing the final item disables checkout without a request", async ({ page }) => {
  const calls = await mock(page);
  await page.goto("/?pos");
  await add(page, "Brownie").click();
  await page.getByRole("button", { name: "Remove Brownie from cart", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cart-empty")).toBeVisible();
  await expect(page.locator(".pos-total")).toContainText("₱0.00");
  await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeDisabled();
  expect(calls).toHaveLength(0);
});

test("adaptive POS uses the full tablet menu and one accessible cart at actual CSS viewports", async ({ page }, info) => {
  await mock(page);
  await page.goto("/?pos");
  await add(page, "Cafe Latte 12 oz").click();
  await add(page, "Brownie").click();
  for (const viewport of [
    { width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1376, height: 1032 },
    { width: 1280, height: 900 }, { width: 1279, height: 900 }, { width: 1032, height: 1376 },
    { width: 768, height: 1024 }, { width: 744, height: 1133 }, { width: 390, height: 844 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    const compact = viewport.width < 1280;
    const menu = await page.locator(".pos-menu").boundingBox();
    const nav = await page.locator(".workspace-sidebar").boundingBox();
    const trigger = page.getByRole("button", { name: /^Open cart/ });
    const grid = await page.locator(".pos-products").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(grid).toBe(viewport.width >= 768 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const regular = page.locator(".product-card").filter({ has: add(page, "Butter Croissant") });
    expect((await regular.boundingBox())!.height).toBeLessThan(176);
    if (compact) {
      await expect(trigger).toBeVisible();
      await expect(trigger).toContainText("2");
      await expect(page.locator(".pos-cart")).toHaveCount(0);
      expect(nav!.width).toBe(viewport.width);
      expect(menu!.width).toBe(viewport.width);
      await page.screenshot({ path: info.outputPath(`tablet-menu-${viewport.width}.png`), fullPage: true });
      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Cart", exact: true });
      await expect(drawer).toBeVisible();
      await expect.poll(async () => {
        const bounds = (await drawer.boundingBox())!;
        return bounds.x + bounds.width;
      }).toBe(viewport.width);
      expect((await drawer.boundingBox())!.height).toBe(viewport.height);
      await expect(drawer.getByRole("heading", { name: "Cart", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Place an order", exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`tablet-cart-${viewport.width}.png`), fullPage: true });
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(trigger).toBeFocused();
    } else {
      await expect(trigger).toBeHidden();
      await expect(page.locator(".pos-cart")).toHaveCount(1);
      const cart = (await page.locator(".pos-cart").boundingBox())!;
      expect(cart.x).toBeGreaterThanOrEqual(menu!.x + menu!.width - 1);
      await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`tablet-menu-${viewport.width}.png`), fullPage: true });
    }
  }
});

test("long labels wrap and many size choices scroll with keyboard focus", async ({ page }) => {
  const catalog = products();
  catalog[0].sizes![0].label = "Small / twelve ounces with an extra descriptive size label";
  const many = { ...catalog[1], id: uid(90), name: "Custom sizes", sizes: Array.from({ length: 20 }, (_, index) => ({
    id: uid(100 + index), label: `Custom size ${index + 1}`, price_cents: 10000 + index * 100, cost_cents: 3000, active: true, is_default: index === 0,
  })) };
  catalog.push(many);
  await page.setViewportSize({ width: 744, height: 1133 });
  await mock(page, catalog);
  await page.goto("/?pos");
  const sizes = sizeGroup(page, "Custom sizes");
  await sizes.getByRole("radio", { name: "Custom size 1", exact: true }).focus();
  for (let i = 1; i < 20; i++) await page.keyboard.press("ArrowRight");
  const last = sizes.getByRole("radio", { name: "Custom size 20", exact: true });
  await expect(last).toBeChecked();
  await expect(last).toBeInViewport();
  expect(await sizes.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(add(page, "Custom sizes Custom size 20")).toContainText("Add to cart");
});


test("tablet drawer traps focus, retains selections and cash across closing and resizing, and completes checkout", async ({ page }) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  const calls = await mock(page);
  await page.goto("/?pos");
  await add(page, "Cafe Latte 12 oz").click();
  await increaseInCart(page, "Cafe Latte 12 oz");
  await sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true }).check();
  await add(page, "Cafe Latte 16 oz").click();
  await add(page, "Brownie").click();
  await page.getByRole("searchbox", { name: "Search products" }).fill("Latte");
  await page.getByRole("button", { name: "Coffee", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Open cart, 4 items", exact: true });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Cart", exact: true });
  const checkout = page.getByRole("button", { name: "Place an order", exact: true });
  await expect(drawer.locator(".order-line")).toHaveCount(3);
  await expect(page.locator(".pos-total")).toContainText("₱490.00");
  await page.getByLabel("Cash received", { exact: true }).fill("600");
  await expect(page.locator(".cart-change")).toContainText("₱110.00");
  await checkout.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close cart", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(checkout).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Search products" })).toHaveValue("Latte");
  await expect(page.getByRole("button", { name: "Coffee", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true })).toBeChecked();
  await trigger.click();
  await page.setViewportSize({ width: 1376, height: 1032 });
  await expect(drawer).toHaveCount(0);
  await expect(page.locator(".pos-cart")).toHaveCount(1);
  await expect(page.getByLabel("Cash received", { exact: true })).toHaveValue("600");
  await page.setViewportSize({ width: 1032, height: 1376 });
  await expect(page.locator(".pos-cart")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("button", { name: "Increase Cafe Latte 16 oz", exact: true }).click();
  await expect(page.locator(".pos-total")).toContainText("₱640.00");
  await checkout.click();
  await expect(drawer.getByRole("alert")).toContainText("Cash received must cover the total.");
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: "Decrease Cafe Latte 16 oz", exact: true }).click();
  await page.getByRole("button", { name: "Remove Cafe Latte 12 oz from cart", exact: true }).click();
  await expect(page.locator(".pos-total")).toContainText("₱230.00");
  await expect(page.locator(".cart-change")).toContainText("₱370.00");
  await page.getByRole("button", { name: "GCash", exact: true }).click();
  await page.getByRole("button", { name: "Close cart", exact: true }).click();
  await page.getByRole("button", { name: "Open cart, 2 items", exact: true }).click();
  await expect(page.getByRole("button", { name: "GCash", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page.getByLabel("Cash received", { exact: true })).toHaveValue("600");
  await checkout.click();
  await expect(drawer.getByRole("status")).toContainText("Sale complete");
  expect(calls[0].data).toMatchObject({ method: "cash", tendered_cents: 60000, items: [
    { product_id: uid(10), size_id: uid(12), quantity: 1, price_cents: 15000 },
    { product_id: uid(40), quantity: 1, price_cents: 8000 },
  ] });
});

test("touch users can select sizes and complete GCash checkout inside the drawer", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1032, height: 1376 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const calls = await mock(page);
  await page.goto("/?pos");
  await sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true }).tap();
  await add(page, "Cafe Latte 16 oz").tap();
  await page.getByRole("button", { name: /^Open cart/ }).tap();
  await page.getByRole("button", { name: "Increase Cafe Latte 16 oz", exact: true }).tap();
  await page.getByRole("button", { name: "Decrease Cafe Latte 16 oz", exact: true }).tap();
  await page.getByRole("button", { name: "GCash", exact: true }).tap();
  await page.getByRole("button", { name: "Place an order", exact: true }).tap();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Sale complete");
  expect(calls[0].data).toMatchObject({ method: "gcash", items: [{ size_id: uid(12), quantity: 1, price_cents: 15000 }] });
  await context.close();
});

test("drawer checkout retains the saved sale across dismissal, reload and retry", async ({ page }) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  await mock(page);
  const calls: unknown[] = [];
  await page.route("**/api/pos", route => {
    if (route.request().method() === "GET") return route.fallback();
    const body = route.request().postDataJSON();
    calls.push(body);
    if (calls.length === 1) return route.abort();
    return route.fulfill({ json: { data: { id: body.data.id, total_cents: 8000 } } });
  });
  await page.goto("/?pos");
  await add(page, "Brownie").click();
  await page.getByRole("button", { name: /^Open cart/ }).click();
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /^Open cart/ }).click();
  await page.getByRole("button", { name: "Retry saved sale", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Sale complete");
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual(calls[0]);
});

test("long tablet and phone carts scroll their items while checkout stays visible", async ({ page }, info) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  const catalog = Array.from({ length: 15 }, (_, index) => ({ ...products()[3], id: uid(200 + index), name: `Pastry ${index + 1}` }));
  await mock(page, catalog);
  await page.goto("/?pos");
  for (let i = 1; i <= 12; i++) await add(page, `Pastry ${i} `).click();
  await page.getByRole("button", { name: /^Open cart/ }).click();
  for (const viewport of [{ width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const checkout = page.getByRole("button", { name: "Place an order", exact: true });
    await expect(checkout).toBeInViewport();
    await expect.poll(async () => {
      const bounds = (await page.getByRole("dialog").boundingBox())!;
      return bounds.x + bounds.width;
    }).toBe(viewport.width);
    const before = await checkout.boundingBox();
    const items = page.locator(".cart-body");
    await items.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => items.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await checkout.boundingBox()).toEqual(before);
    await expect(page.getByLabel("Cash received", { exact: true })).toBeInViewport();
    expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const control of await page.locator(".order-controls button, .order-remove, .cart-close").all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: info.outputPath(`long-cart-${viewport.width}.png`), fullPage: true });
  }
});


for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`selection-only cards reflect Cart quantity and removal at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const calls = await mock(page);
    await page.goto("/?pos");
    await page.evaluate(() => document.fonts.ready);
    const card = page.getByRole("article", { name: "Cafe Latte", exact: true });
    const open = async () => { if (viewport.width < 1280) await page.getByRole("button", { name: /^Open cart/ }).click(); };
    const close = async () => { if (viewport.width < 1280) await page.getByRole("button", { name: "Close cart", exact: true }).click(); };
    const initialHeight = (await card.boundingBox())!.height;
    await expect(page.locator(".pos-menu").getByRole("button", { name: /Increase|Decrease/ })).toHaveCount(0);
    await expect(card.locator(".product-cart-quantity")).toHaveCount(0);
    await expect(add(page, "Cafe Latte 12 oz")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await add(page, "Cafe Latte 12 oz").focus();
    await page.keyboard.press("Enter");
    await expect(card).toBeFocused();
    await expect(card.locator(".product-added")).toHaveText("Added to cart");
    await expect(card.getByRole("button", { name: /Add to cart|Added to cart/ })).toHaveCount(0);
    await expect(card.locator(".product-cart-quantity")).toHaveText("1 in cart");
    await card.locator(".product-added").click();
    await expect(card.locator(".product-cart-quantity")).toHaveText("1 in cart");
    expect((await card.boundingBox())!.height).toBe(initialHeight);
    expect(initialHeight).toBeLessThan(176);
    await open();
    const line = page.locator(".order-line").filter({ hasText: "Size: 12 oz" });
    await expect(line.locator(".order-controls > span")).toHaveText("1");
    await page.getByRole("button", { name: "Increase Cafe Latte 12 oz", exact: true }).click();
    await page.getByLabel("Cash received", { exact: true }).fill("600");
    await expect(page.locator(".cart-change")).toContainText("₱340.00");
    await page.getByRole("button", { name: "Increase Cafe Latte 12 oz", exact: true }).click();
    await close();
    await expect(card.locator(".product-cart-quantity")).toHaveText("3 in cart");
    await sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true }).check();
    await expect(card.locator(".product-cart-quantity")).toHaveCount(0);
    await expect(add(page, "Cafe Latte 16 oz")).toBeVisible();
    await add(page, "Cafe Latte 16 oz").click();
    await expect(card.locator(".product-cart-quantity")).toHaveText("1 in cart");
    await sizeGroup(page).getByRole("radio", { name: "12 oz", exact: true }).check();
    await expect(card.locator(".product-cart-quantity")).toHaveText("3 in cart");
    await expect(page.locator(".pos-menu").getByRole("button", { name: /Increase|Decrease/ })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`selection-only-${viewport.width}.png`), animations: "disabled" });
    await open();
    const decrease = page.getByRole("button", { name: "Decrease Cafe Latte 12 oz", exact: true });
    for (let i = 0; i < 3; i++) await decrease.click();
    await expect(page.locator(".order-line")).toHaveCount(1);
    await expect(page.locator(".order-line")).toContainText("Size: 16 oz");
    await expect(page.locator(".pos-total")).toContainText("₱150.00");
    await expect(page.locator(".cart-change")).toContainText("₱450.00");
    await close();
    await expect(add(page, "Cafe Latte 12 oz")).toBeVisible();
    await expect(card.locator(".product-cart-quantity, .product-added")).toHaveCount(0);
    await sizeGroup(page).getByRole("radio", { name: "16 oz", exact: true }).check();
    await expect(card.locator(".product-cart-quantity")).toHaveText("1 in cart");
    await open();
    await page.getByRole("button", { name: "Remove Cafe Latte 16 oz from cart", exact: true }).click();
    await expect(page.locator(".pos-total")).toContainText("₱0.00");
    await close();
    await expect(add(page, "Cafe Latte 16 oz")).toBeVisible();
    await expect(card.locator(".product-cart-quantity")).toHaveCount(0);
    await add(page, "Brownie").click();
    await open();
    await page.getByRole("button", { name: "Decrease Brownie", exact: true }).click();
    await close();
    await expect(add(page, "Brownie")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(calls).toHaveLength(0);
  });
}

test("Cart quantity limits remain accurate in the passive product indicator", async ({ page }) => {
  await mock(page);
  await page.goto("/?pos");
  await add(page, "Brownie").click();
  const increase = page.getByRole("button", { name: "Increase Brownie", exact: true });
  for (let i = 1; i < 100; i++) await increase.press("Enter");
  const card = page.getByRole("article", { name: "Brownie", exact: true });
  await expect(card.locator(".product-cart-quantity")).toHaveText("100 in cart");
  await expect(increase).toBeDisabled();
  await expect(page.locator(".pos-total")).toContainText("₱8,000.00");
  await page.getByRole("button", { name: "Decrease Brownie", exact: true }).click();
  await expect(card.locator(".product-cart-quantity")).toHaveText("99 in cart");
  await expect(increase).toBeEnabled();
  await increase.click();
  await expect(card.locator(".product-cart-quantity")).toHaveText("100 in cart");
  await expect(card.getByRole("button")).toHaveCount(0);
});

test("changed prices and unavailable options retain passive card status and immutable cart snapshots", async ({ page }) => {
  const catalog = products();
  await mock(page, catalog);
  await page.goto("/?pos");
  await add(page, "Cafe Latte 12 oz").click();
  catalog[0].sizes![0].price_cents = 14000;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const increase = page.getByRole("button", { name: "Increase Cafe Latte 12 oz", exact: true });
  await expect(increase).toBeDisabled();
  await expect(page.locator(".cart-item-issue")).toContainText("changed");
  await expect(page.locator(".pos-total")).toContainText("₱130.00");
  await page.getByRole("button", { name: /Use 12 oz/ }).click();
  await expect(increase).toBeEnabled();
  await increase.click();
  await expect(page.locator(".pos-total")).toContainText("₱280.00");
  catalog[0].active = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(increase).toBeDisabled();
  await expect(page.locator(".cart-item-issue")).toContainText("no longer available");
  await expect(page.locator(".pos-total")).toContainText("₱280.00");
  const card = page.getByRole("article", { name: "Cafe Latte", exact: true });
  await expect(card.locator(".product-cart-quantity")).toHaveText("2 in cart");
  await expect(card.getByRole("button")).toHaveCount(0);
  const decrease = page.getByRole("button", { name: "Decrease Cafe Latte 12 oz", exact: true });
  await decrease.click();
  await decrease.click();
  await expect(add(page, "Cafe Latte 12 oz")).toBeDisabled();
  await expect(card.locator(".product-cart-quantity, .product-added")).toHaveCount(0);
  await expect(page.locator(".order-line")).toHaveCount(0);
  await expect(add(page, "Pumpkin Spice Latte")).toBeDisabled();
});
