import { expect, test, type Page } from "@playwright/test";

const modules = [
  { path: "/pos", label: "POS", heading: "Product menu" },
  { path: "/menu", label: "Menu", heading: "Menu Management" },
  { path: "/app/sales", label: "Sales", heading: "Sales" },
  { path: "/expenses", label: "Expenses", heading: "Expenses Management" },
  { path: "/libraries", label: "Libraries", heading: "Libraries" },
];
async function catalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: "00000000-0000-4000-8000-000000000001", name: "Common Ground Coffee" },
    user_id: "00000000-0000-4000-8000-000000000001", founder: true,
    categories: [{ id: "00000000-0000-4000-8000-000000000002", name: "Coffee" }],
    products: [{ id: "00000000-0000-4000-8000-000000000003", name: "Latte", price_cents: 14500, cost_cents: 5000, active: true,
      category_id: "00000000-0000-4000-8000-000000000002" }],
  } }));
}
async function tabletHeader(page: Page, active: string) {
  const header = page.locator(".workspace-sidebar");
  await expect(header).toHaveCount(1);
  const brand = (await page.locator(".workspace-brand").boundingBox())!;
  const account = (await page.getByRole("button", { name: "Sign out", exact: true }).boundingBox())!;
  const nav = page.getByRole("navigation", { name: "Shop", exact: true });
  const bounds = (await nav.boundingBox())!;
  expect(brand.x).toBe(24);
  expect(Math.abs(brand.y + brand.height / 2 - account.y - account.height / 2)).toBeLessThan(1);
  expect(account.x + account.width).toBe(page.viewportSize()!.width - 24);
  expect(bounds.y).toBeGreaterThanOrEqual(Math.max(brand.y + brand.height, account.y + account.height) + 8);
  await expect(nav).toHaveCSS("flex-wrap", "nowrap");
  await expect(nav).toHaveCSS("overflow-x", "auto");
  const links = nav.getByRole("link");
  await expect(links).toHaveCount(5);
  let previousRight: number | undefined;
  for (const screen of modules) {
    const link = nav.getByRole("link", { name: screen.label, exact: true });
    await expect(link).toHaveAttribute("href", screen.path);
    await expect(link).toHaveCSS("font-size", "14px");
    const box = (await link.boundingBox())!;
    expect(box.y).toBe(bounds.y);
    expect(box.height).toBeGreaterThanOrEqual(44);
    if (previousRight !== undefined) expect(box.x - previousRight).toBe(8);
    previousRight = box.x + box.width;
    const icon = (await link.locator("svg").boundingBox())!;
    expect(icon.width).toBe(20);
    expect(icon.height).toBe(20);
  }
  const selected = nav.getByRole("link", { name: active, exact: true });
  await expect(selected).toHaveAttribute("aria-current", "page");
  await expect(selected).toHaveClass(/selected/);
  expect(await nav.locator('[aria-current="page"]').count()).toBe(1);
  await expect(page.locator(".sidebar-footer form")).toHaveAttribute("action", "/auth/sign-out");
  await expect(page.locator(".sidebar-footer form")).toHaveAttribute("method", "post");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return (await header.boundingBox())!;
}
for (const viewport of [
  { width: 768, height: 1024 }, { width: 960, height: 1440 }, { width: 1032, height: 1376 },
]) {
  test(`all five modules keep the same two-row header at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await catalog(page);
    await page.goto("/pos");
    let headerHeight: number | undefined;
    for (const screen of modules) {
      if (screen.path !== "/pos") await page.getByRole("navigation", { name: "Shop" }).getByRole("link", { name: screen.label, exact: true }).click();
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const bounds = await tabletHeader(page, screen.label);
      if (headerHeight === undefined) headerHeight = bounds.height;
      expect(bounds.height).toBe(headerHeight);
      await page.screenshot({ path: info.outputPath(`header-${screen.label.toLowerCase()}-${viewport.width}.png`), clip: bounds, animations: "disabled" });
    }
  });
}

test("tablet search/cart toolbar stays aligned and retains the same drawer state across widths", async ({ page }, info) => {
  await catalog(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/pos");
  await page.getByRole("button", { name: /Latte.*Add to cart/ }).click();
  for (const viewport of [{ width: 768, height: 1024 }, { width: 960, height: 1440 }, { width: 1032, height: 1376 }, { width: 1279, height: 900 }]) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole("button", { name: "Open cart, 1 items", exact: true });
    const search = (await page.locator(".pos-search").boundingBox())!;
    const cart = (await trigger.boundingBox())!;
    const header = (await page.locator(".workspace-sidebar").boundingBox())!;
    expect(search.width).toBeGreaterThanOrEqual(240);
    expect(cart.width).toBeGreaterThanOrEqual(200);
    expect(Math.abs(search.y + search.height / 2 - cart.y - cart.height / 2)).toBeLessThan(1);
    expect(search.y).toBeGreaterThan(header.y + header.height);
    expect(cart.x).toBeGreaterThan(search.x + search.width);
    expect(cart.x + cart.width).toBe(viewport.width - 24);
    await page.screenshot({ path: info.outputPath(`tablet-pos-${viewport.width}.png`), animations: "disabled" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Cart", exact: true })).toBeVisible();
    await expect(page.locator(".order-line")).toHaveCount(1);
    await expect(page.locator(".pos-total")).toContainText("145.00");
    await page.getByRole("button", { name: "Close cart", exact: true }).click();
    await expect(trigger).toBeFocused();
  }
});

test("desktop sidebars and compact mobile headers remain consistent across modules", async ({ page }, info) => {
  await catalog(page);
  for (const viewport of [{ width: 1376, height: 1032 }, { width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const screen of modules) {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
      const header = (await page.locator(".workspace-sidebar").boundingBox())!;
      expect(header.width).toBe(viewport.width >= 1280 ? 216 : viewport.width);
      await expect(page.getByRole("navigation", { name: "Shop" }).getByRole("link", { name: screen.label, exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (screen.label === "POS") {
        const trigger = page.getByRole("button", { name: /^Open cart/ });
        if (viewport.width >= 1280) {
          await expect(trigger).toBeHidden();
          await expect(page.locator(".pos-cart")).toBeVisible();
        } else {
          await expect(trigger).toBeVisible();
        }
        await page.screenshot({ path: info.outputPath(`desktop-mobile-${viewport.width}.png`), animations: "disabled" });
      }
    }
  }
});

test("enlarged text scrolls one tablet navigation row and keyboard focus remains visible", async ({ page }, info) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await catalog(page);
  await page.goto("/pos");
  await expect(page.getByRole("heading", { name: "Product menu", exact: true })).toBeVisible();
  // Enlarge navigation text without changing the CSS viewport, then test zoom-style reflow separately.
  await page.addStyleTag({ content: ".workspace-sidebar .nav-link { font-size: 28px; } .workspace-brand { font-size: 36px; }" });
  await page.evaluate(() => document.fonts.ready);
  const nav = page.getByRole("navigation", { name: "Shop" });
  const links = nav.getByRole("link");
  const boxes = await links.evaluateAll(elements => elements.map(el => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height })));
  expect(new Set(boxes.map(box => box.top)).size).toBe(1);
  expect(await nav.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const last = nav.getByRole("link", { name: "Libraries", exact: true });
  await links.first().focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(last).toHaveCSS("outline-style", "solid");
  await expect(last).toHaveCSS("outline-offset", "-3px");
  await expect.poll(() => nav.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  const focusedBounds = (await last.boundingBox())!;
  const navBounds = (await nav.boundingBox())!;
  expect(focusedBounds.x + focusedBounds.width).toBeLessThanOrEqual(navBounds.x + navBounds.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0)).toBe(true);
  await page.screenshot({ path: info.outputPath("tablet-enlarged-text.png"), animations: "disabled" });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Libraries", exact: true })).toBeVisible();
  // A 1032px-wide viewport at 200% browser zoom has approximately 516 CSS pixels for reflow.
  await page.setViewportSize({ width: 516, height: 688 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("link", { name: "POS", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "POS", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Open cart/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("zoom-reflow-516.png"), animations: "disabled" });
});
