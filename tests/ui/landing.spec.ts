import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 }, { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`public storefront fits ${viewport.width}px with real assets and isolated navigation`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/?landing");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Good coffee.");
    await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Explore Our Menu", exact: true })).toHaveAttribute("href", "/coffee-menu");
    const hero = page.locator(".site-hero-photo .site-photo-composition > img");
    await expect(hero).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
    expect(await hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(hero).toHaveAttribute("src", "/site/takeaway-latte-concept.webp");
    await expect(page.locator(".site-cup-sticker img")).toHaveCount(2);
    for (const image of await page.locator(".site-cup-sticker img").all()) {
      await expect(image).toHaveAttribute("src", "/images/Logov1.png");
      expect(await image.evaluate((el: HTMLImageElement) => Math.abs(el.clientWidth / el.clientHeight - el.naturalWidth / el.naturalHeight))).toBeLessThan(0.05);
    }
    await expect(page.locator(".coffee-site")).not.toContainText("LOGO Coffee");
    await expect(page.getByRole("img", { name: "LOGO", exact: true })).toHaveCount(2);
    await expect(page.locator(".site-gallery, .site-location-ribbon")).toHaveCount(0);
    await expect(page.locator("main section")).toHaveCount(5);
    await expect(page.locator(".site-featured .site-product")).toHaveCount(4);
    await expect(page.getByRole("list", { name: "Available sizes for Café Latte", exact: true })).toContainText("12 oz16 oz");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/storefront/home-${viewport.width}.png` });
    await page.screenshot({ path: `.local/ui-review/storefront/full-${viewport.width}.png`, fullPage: true });
    await page.getByRole("heading", { name: "Your next coffee stop." }).scrollIntoViewIfNeeded();
    await expect(page.locator(".site-visit-details")).toContainText("Purok 6, Ising, Carmen, Davao del Norte");
    await expect(page.locator(".site-visit-details")).toContainText("5:00 PM–9:00 PM");
    await expect(page.getByRole("link", { name: /Get Directions/ })).toHaveAttribute("href", /google\.com\/maps\/search/);
    expect(new URL((await page.getByRole("link", { name: /Get Directions/ }).getAttribute("href"))!).searchParams.get("query")).toBe("LOGO, Purok 6, Ising, Carmen, Davao del Norte");
    await page.screenshot({ path: `.local/ui-review/storefront/visit-${viewport.width}.png` });
    await page.goto("/coffee-menu");
    await expect(page.locator(".site-product")).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/storefront/menu-${viewport.width}.png`, fullPage: true });
    if (viewport.width < 900) {
      await page.getByRole("button", { name: "Open customer navigation", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "Customer navigation", exact: true });
      await expect(drawer.getByRole("button", { name: "Close customer navigation", exact: true })).toBeFocused();
      await expect(drawer.getByRole("navigation").getByRole("link")).toHaveCount(4);
      await expect(drawer.getByRole("link", { name: "View Menu", exact: true })).toHaveAttribute("href", "/coffee-menu");
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open customer navigation", exact: true })).toBeFocused();
    }
  });
}

test("public menu filters categories and shows actual size prices without cashier actions", async ({ page }) => {
  await page.goto("/?landing&catalog");
  await expect(page.locator(".site-product")).toHaveCount(4);
  await expect(page.getByRole("list", { name: "Available sizes for Café Latte" })).toContainText("12 oz₱120.00");
  await expect(page.getByRole("list", { name: "Available sizes for Café Latte" })).toContainText("16 oz₱145.00");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await expect(page.locator(".site-product")).toHaveCount(1);
  await expect(page.locator(".site-product")).toContainText("Butter Croissant");
  await page.getByRole("button", { name: "All selections", exact: true }).click();
  await expect(page.locator(".site-product")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /Add to cart|Place an order|Edit|Delete|Checkout/ })).toHaveCount(0);
  await expect(page.getByText(/cost_cents|Gross Profit|Net Profit|Sample products/)).toHaveCount(0);
});

test("catalog refreshes availability, retains valid results on failure, and rejects invalid responses", async ({ page }) => {
  let failure = false, malformed = false;
  await page.route("**/api/public-menu", route => route.fulfill({ status: failure ? 503 : 200, json: failure ? { error: "Unavailable" } : malformed ? { status: "published", products: [], cost_cents: 42 } : { status: "published", products: [] } }));
  await page.goto("/?landing&catalog");
  await expect(page.locator(".site-product")).toHaveCount(4);
  failure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("status").filter({ hasText: "last loaded menu" })).toBeVisible();
  await expect(page.locator(".site-product")).toHaveCount(4);
  failure = false; malformed = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".site-product")).toHaveCount(4);
  malformed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".site-product")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Our online menu is being prepared." })).toBeVisible();
});

test("unpublished content stays honest with reduced motion and keyboard access", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?landing&unpublished");
  await expect(page.getByText("Your next favorite is waiting in store.", { exact: true })).toBeVisible();
  await expect(page.getByText(/123 Coffee Lane|hello@example|5-star|best sellers/i)).toHaveCount(0);
  await expect(page.locator(".site-hero-photo figcaption")).toContainText("Concept imagery");
  await expect(page.locator(".site-featured .site-product")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  expect(await page.locator(".coffee-site").evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
});
