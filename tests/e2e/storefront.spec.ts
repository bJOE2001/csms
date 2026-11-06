import { expect, test } from "@playwright/test";

test("public routes render without authentication and preserve internal route boundaries", async ({ page, request }) => {
  for (const [route, title] of [["/", "LOGO — Good Coffee. Better Moments."], ["/menu", "Our Menu — LOGO"], ["/visit", "Visit Us — LOGO, Carmen"]]) {
    await page.goto(route);
    await expect(page).toHaveTitle(title);
    expect((await request.get(route)).headers()["x-robots-tag"]).toBeUndefined();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
    await expect.poll(() => page.locator(".site-header .brand-logo").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const privateCatalog = await request.get("/api/pos");
  expect(privateCatalog.status()).toBe(401);
  const dashboard = await request.get("/dashboard", { maxRedirects: 0 });
  expect(dashboard.status()).toBe(307);
  expect(dashboard.headers().location).toContain("/sign-in");
  const management = await request.get("/app/menu", { maxRedirects: 0 });
  expect(management.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await page.goto("/app/menu");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add product", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  const publicMenu = await request.get("/api/public-menu");
  expect(publicMenu.status()).toBe(200);
  const catalog = await publicMenu.json();
  expect(["published", "unpublished"]).toContain(catalog.status);
  expect(Array.isArray(catalog.products)).toBe(true);
  expect(JSON.stringify(catalog)).not.toMatch(/cost_cents|total_cost_cents|created_by|server-test-secret/);
  expect((await request.post("/api/public-menu", { data: { action: "checkout" } })).status()).toBe(405);
});

test("legacy public menu bookmarks redirect permanently and retain query strings and product anchors", async ({ page, request }) => {
  const response = await request.get("/coffee-menu?source=bookmark", { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe("/menu?source=bookmark");
  await page.goto("/coffee-menu?source=bookmark#product-existing");
  await expect(page).toHaveURL(/\/menu\?source=bookmark#product-existing$/);
  await expect(page).toHaveTitle("Our Menu — LOGO");
  await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
});

test("production storefront optimizes its hero and offers genuine navigation and directions", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".site-hero-photo .site-photo-composition > img");
  await expect(hero).toHaveAttribute("src", /\/_next\/image\?/);
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.locator('link[rel="preload"][as="image"]').count()).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Explore Our Menu", exact: true }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByRole("button", { name: /Add to cart|Checkout|Place an order/ })).toHaveCount(0);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "Open customer navigation", exact: true }).click();
  await page.getByRole("dialog", { name: "Customer navigation", exact: true }).getByRole("link", { name: "Visit Us", exact: true }).click();
  await expect(page).toHaveURL(/\/visit$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const directions = new URL((await page.getByRole("link", { name: /Get Directions/ }).getAttribute("href"))!);
  expect(directions.href).toBe("https://maps.app.goo.gl/JFPkDck15BBvFdLe9");
  await expect(page.locator(".site-visit-details")).toContainText("5:00 PM–9:00 PM");
  await expect(page.getByText(/Open Now|Closed Now|123 Coffee Lane/)).toHaveCount(0);
});

test("public product images optimize without cropping and details hydrate as a read-only dialog", async ({ page }) => {
  const product = { id: "00000000-0000-4000-8000-000000000001", name: "Public image integration fixture", category: "Coffee", description: "Complete catalog description. ".repeat(18).trim(), image: "/site/iced-coffee.webp", price: 9500, sizes: [{ label: "Small", price: 9500 }, { label: "Large", price: 12000 }] };
  // Browser-only catalog fixture; no hosted product or photograph is changed.
  await page.route("**/api/public-menu", route => route.fulfill({ json: { status: "published", products: [product] } }));
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/menu");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const card = page.locator(`#product-${product.id}`);
  await expect(card.getByRole("heading")).toHaveText(product.name);
  const image = card.getByRole("img", { name: product.name, exact: true });
  await expect(image).toHaveAttribute("src", /\/_next\/image\?/);
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(card.locator(".site-product-photo")).not.toHaveAttribute("aria-busy", "true");
  await expect(card.locator(".site-product-meta > strong")).toHaveText("From ₱95.00");
  const action = card.getByRole("button", { name: `View details for ${product.name}`, exact: true });
  await action.click();
  const dialog = page.getByRole("dialog", { name: product.name, exact: true });
  await expect(dialog.locator(".site-product-detail-copy > p")).toHaveText(product.description);
  await expect(dialog.getByRole("list")).toContainText("Small₱95.00Large₱120.00");
  await expect(dialog.getByRole("img", { name: product.name, exact: true })).toHaveCSS("object-fit", "contain");
  await expect(dialog.getByRole("button", { name: /Add to cart|Checkout|Place an order/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(action).toBeFocused();
});

test("SEO includes honest local data, excludes private URLs, and leaves unknown facts unset", async ({ page, request }) => {
  await page.goto("/");
  const schema = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(schema["@type"]).toBe("CafeOrCoffeeShop");
  expect(schema.address).toBe("Purok 6, Ising, Carmen, Davao del Norte");
  expect(schema.aggregateRating).toBeUndefined();
  expect(schema.telephone).toBeUndefined();
  expect(schema.openingHours).toBeUndefined();
  expect((await request.get("/robots.txt")).status()).toBe(200);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /dashboard");
  expect(robots).toContain("Allow: /menu");
  expect(robots).toContain("Disallow: /app");
  expect(robots).not.toContain("Disallow: /menu");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toMatch(/\/dashboard|\/pos|\/app\/|\/coffee-menu/);
  await expect(page.getByRole("navigation", { name: "Customer navigation", exact: true }).getByRole("link", { name: "Menu", exact: true })).toHaveAttribute("href", "/menu");
});
