import { expect, test } from "@playwright/test";

test("public routes render without authentication and preserve internal route boundaries", async ({ page, request }) => {
  for (const [route, title] of [["/", "LOGO Coffee — Good Coffee. Better Moments."], ["/coffee-menu", "Our Menu — LOGO Coffee"], ["/visit", "Visit Us — LOGO Coffee, Carmen"]]) {
    await page.goto(route);
    await expect(page).toHaveTitle(title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator(".workspace-sidebar")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const privateCatalog = await request.get("/api/pos");
  expect(privateCatalog.status()).toBe(401);
  const dashboard = await request.get("/dashboard", { maxRedirects: 0 });
  expect(dashboard.status()).toBe(307);
  expect(dashboard.headers().location).toContain("/sign-in");
  const management = await request.get("/menu");
  expect(management.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  const publicMenu = await request.get("/api/public-menu");
  expect(publicMenu.status()).toBe(200);
  const catalog = await publicMenu.json();
  expect(["published", "unpublished"]).toContain(catalog.status);
  expect(Array.isArray(catalog.products)).toBe(true);
  expect(JSON.stringify(catalog)).not.toMatch(/cost_cents|total_cost_cents|created_by|server-test-secret/);
  expect((await request.post("/api/public-menu", { data: { action: "checkout" } })).status()).toBe(405);
});

test("production storefront optimizes its hero and offers genuine navigation and directions", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".site-hero-photo > img");
  await expect(hero).toHaveAttribute("src", /\/_next\/image\?/);
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.locator('link[rel="preload"][as="image"]').count()).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Explore Our Menu", exact: true }).click();
  await expect(page).toHaveURL(/\/coffee-menu$/);
  await expect(page.getByRole("button", { name: /Add to cart|Checkout|Place an order/ })).toHaveCount(0);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.getByRole("button", { name: "Open customer navigation", exact: true }).click();
  await page.getByRole("dialog", { name: "Customer navigation", exact: true }).getByRole("link", { name: "Visit Us", exact: true }).click();
  await expect(page).toHaveURL(/\/visit$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const directions = new URL((await page.getByRole("link", { name: /Get Directions/ }).getAttribute("href"))!);
  expect(directions.searchParams.get("query")).toContain("Purok 6, Ising, Carmen, Davao del Norte");
  await expect(page.locator(".site-visit-details")).toContainText("5:00 PM–9:00 PM");
  await expect(page.getByText(/Open Now|Closed Now|123 Coffee Lane/)).toHaveCount(0);
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
  expect(robots).toContain("Disallow: /menu");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).not.toMatch(/\/dashboard|\/pos|\/app\/sales/);
  await expect(page.getByRole("navigation", { name: "Customer navigation", exact: true }).getByRole("link", { name: "Menu", exact: true })).toHaveAttribute("href", "/coffee-menu");
});
