import { expect, test } from "@playwright/test";

test("public home explains pre-opening state without fabricated sales", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build the business before the first cup." })).toBeVisible();
  await expect(page.getByText("No operating transactions recorded")).toBeVisible();
  await expect(page.getByText("PRE-OPENING")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
});

test("sign-in offers existing account access only", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.getByText("Use your founder or staff account. Ask a founder if you need access.")).toBeVisible();
  await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
});

test("management routes redirect visitors to authentication", async ({ page }) => {
  for (const path of ["/app/menu", "/app/recipes", "/app/setup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  }
});

test("public shell survives offline refresh and excludes private responses", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  // Reload once under worker control so hashed style/script assets are cached.
  await page.reload({ waitUntil: "networkidle" });
  const cachedPaths = await page.evaluate(async () => {
    const cache = await caches.open("coffee-public-shell-v3");
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths.some((path) => path.startsWith("/_next/static/") && path.endsWith(".css"))).toBe(true);
  expect(cachedPaths.some((path) => /^\/(app|api|auth)(\/|$)/.test(path))).toBe(false);
  const onlineBackground = await page.locator("body").evaluate(body => getComputedStyle(body).backgroundColor);
  expect(onlineBackground).not.toBe("rgba(0, 0, 0, 0)");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Build the business before the first cup." })).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("background-color", onlineBackground);
});
