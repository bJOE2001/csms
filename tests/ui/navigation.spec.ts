import { expect, test, type Page } from "@playwright/test";

const modules = [
  { path: "/dashboard", label: "Dashboard", heading: "Dashboard" },
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
const trigger = (page: Page) => page.getByRole("button", { name: "Open navigation menu", exact: true });
const drawer = (page: Page) => page.getByRole("dialog", { name: "Navigation menu", exact: true });

async function compactHeader(page: Page) {
  const header = page.locator(".workspace-mobile-header");
  await expect(header).toBeVisible();
  await expect(page.locator(".workspace-sidebar")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Shop", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(header.getByRole("img", { name: "LOGO Coffee", exact: true })).toBeVisible();
  await expect(header.locator(":scope > *")).toHaveCount(2);
  const logo = (await header.locator(".brand-artwork").boundingBox())!;
  const button = (await trigger(page).boundingBox())!;
  expect(Math.abs(logo.y + logo.height / 2 - button.y - button.height / 2)).toBeLessThan(1);
  expect(button.width).toBe(44);
  expect(button.height).toBe(44);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(90);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("desktop keeps its sidebar with a smaller logo aligned to page headers", async ({ page }, info) => {
  test.setTimeout(120_000);
  await catalog(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const screen of modules) {
      await page.goto(screen.path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible({ timeout: 15_000 });
      const sidebar = page.locator(".workspace-sidebar");
      await expect(sidebar).toBeVisible();
      await expect(page.locator(".workspace-mobile-header")).toBeHidden();
      await expect(trigger(page)).toHaveCount(0);
      const logo = (await sidebar.locator(".brand-artwork").boundingBox())!;
      expect(logo.width).toBe(128);
      expect(logo.height).toBe(64);
      const navigationIcon = (await sidebar.locator(".workspace-nav .nav-link > svg").first().boundingBox())!;
      expect(Math.abs(logo.x - navigationIcon.x)).toBeLessThan(2);
      if (screen.label !== "POS") {
        const title = (await page.getByRole("heading", { name: screen.heading, exact: true }).boundingBox())!;
        // Dashboard uses its compact 24px content inset; other modules retain 32px.
        expect(Math.abs(logo.y - title.y - (screen.label === "Dashboard" ? 8 : 0))).toBeLessThan(2);
      }
      await expect(page.getByRole("navigation", { name: "Shop" }).getByRole("link")).toHaveCount(6);
      await expect(page.getByRole("link", { name: screen.label, exact: true })).toHaveAttribute("aria-current", "page");
      const signOut = (await sidebar.getByRole("button", { name: "Sign out", exact: true }).boundingBox())!;
      expect(signOut.y + signOut.height).toBe(viewport.height - 24);
      if (screen.label === "Menu")
        await page.screenshot({ path: info.outputPath("desktop-" + viewport.width + ".png") });
    }
  }
});

for (const viewport of [
  { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 393, height: 844 },
]) {
  test("compact header and navigation drawer serve every module at " + viewport.width + "px", async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await catalog(page);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    for (let index = 0; index < modules.length; index++) {
      const screen = modules[index];
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible({ timeout: 15_000 });
      await compactHeader(page);
      if (index === 0) await page.screenshot({ path: info.outputPath("header-" + viewport.width + ".png") });
      await trigger(page).click();
      const menu = drawer(page);
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("button", { name: "Close navigation menu" })).toBeFocused();
      const nav = menu.getByRole("navigation", { name: "Shop", exact: true });
      await expect(nav.getByRole("link")).toHaveCount(6);
      for (const item of modules) {
        const link = nav.getByRole("link", { name: item.label, exact: true });
        await expect(link).toHaveAttribute("href", item.path);
        await expect(link).toBeInViewport();
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      const selected = nav.getByRole("link", { name: screen.label, exact: true });
      await expect(selected).toHaveAttribute("aria-current", "page");
      await expect(selected).toHaveCSS("background-color", "rgb(242, 161, 94)");
      await expect(menu).toHaveCSS("background-color", "rgb(59, 27, 18)");
      await expect(menu.locator("form")).toHaveAttribute("action", "/auth/sign-out");
      await expect(menu.locator("form")).toHaveAttribute("method", "post");
      await expect(menu.getByRole("button", { name: "Sign out", exact: true })).toBeInViewport();
      if (index === 0) await page.screenshot({ path: info.outputPath("drawer-" + viewport.width + ".png") });
      if (index + 1 < modules.length) {
        await nav.getByRole("link", { name: modules[index + 1].label, exact: true }).click();
        await page.waitForURL("**" + modules[index + 1].path, { waitUntil: "domcontentloaded" });
      } else await menu.getByRole("button", { name: "Close navigation menu" }).click();
      await expect(menu).toHaveCount(0);
    }
  });
}

test("drawer supports keyboard trapping, Escape, close button and overlay dismissal", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 844 });
  await catalog(page);
  await page.goto("/menu");
  const toggle = trigger(page);
  await toggle.focus();
  await page.keyboard.press("Enter");
  const menu = drawer(page);
  await expect(menu.getByRole("button", { name: "Close navigation menu" })).toBeFocused();
  await expect(page.locator(".workspace-mobile-header .navigation-toggle")).toHaveAttribute("aria-expanded", "true");
  for (const direction of ["Tab", "Shift+Tab"]) {
    for (let index = 0; index < 9; index++) {
      await page.keyboard.press(direction);
      expect(await menu.evaluate(node => node.contains(document.activeElement))).toBe(true);
    }
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await menu.getByRole("button", { name: "Close navigation menu" }).click();
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await toggle.click();
  await page.locator(".workspace-nav-overlay").click({ position: { x: 390, y: 40 } });
  await expect(menu).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

test("crossing the desktop breakpoint closes the drawer and restores visible sidebar focus", async ({ page }) => {
  await catalog(page);
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.goto("/libraries");
  await trigger(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(drawer(page)).toHaveCount(0);
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Shop" }).getByRole("link", { name: "Libraries", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 393, height: 844 });
  await compactHeader(page);
  await expect(drawer(page)).toHaveCount(0);
});

test("navigation and cart drawers remain independent and preserve the current order", async ({ page }) => {
  await catalog(page);
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.goto("/pos");
  await page.getByRole("button", { name: /Latte.*Add to cart/ }).click();
  const cartTrigger = page.getByRole("button", { name: "Open cart, 1 items", exact: true });
  await cartTrigger.click();
  await page.getByLabel("Cash received", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Close cart", exact: true }).click();
  await trigger(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cart", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await cartTrigger.click();
  const cart = page.getByRole("dialog", { name: "Cart", exact: true });
  await expect(cart).toBeVisible();
  await expect(cart.locator(".order-line")).toHaveCount(1);
  await expect(cart.getByLabel("Cash received", { exact: true })).toHaveValue("200");
  await expect(cart.locator(".pos-total")).toContainText("145.00");
  await expect(drawer(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(cartTrigger).toBeFocused();
});

test("short screens and enlarged drawer text remain scrollable and keyboard accessible", async ({ page }, info) => {
  await catalog(page);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.goto("/menu");
  // Enlarge navigation text without changing the CSS viewport, then test zoom-style reflow separately.
  await page.addStyleTag({ content: ".workspace-navigation-drawer .nav-link { font-size: 28px; }" });
  await trigger(page).click();
  const menu = drawer(page);
  const signOut = menu.getByRole("button", { name: "Sign out", exact: true });
  await page.keyboard.press("Tab");
  await signOut.focus();
  await expect(signOut).toBeInViewport();
  await expect(signOut).toHaveCSS("outline-style", "solid");
  expect(await menu.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("landscape-enlarged.png") });
  await page.keyboard.press("Escape");
  // A 1032px-wide viewport at 200% browser zoom has approximately 516 CSS pixels for reflow.
  await page.setViewportSize({ width: 516, height: 688 });
  await compactHeader(page);
  await trigger(page).click();
  await expect(menu.getByRole("link", { name: "Libraries", exact: true })).toBeInViewport();
});

test("drawer Sign out retains the existing POST endpoint", async ({ page }) => {
  await catalog(page);
  await page.setViewportSize({ width: 393, height: 844 });
  await page.route("**/auth/sign-out", route => route.fulfill({ contentType: "text/html", body: "<h1>Signed out test</h1>" }));
  await page.goto("/pos");
  await trigger(page).click();
  const request = page.waitForRequest(req => new URL(req.url()).pathname === "/auth/sign-out");
  await drawer(page).getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await request).method()).toBe("POST");
});
