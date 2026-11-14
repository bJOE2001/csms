import { expect, test } from "@playwright/test";
import { workspaceModules } from "../../src/lib/workspace";

test("login is public and legacy sign-in bookmarks preserve their credential error", async ({ request, page }) => {
  const legacy = await request.get("/sign-in?error=credentials", { maxRedirects: 0 });
  expect(legacy.status()).toBe(307);
  const destination = new URL(legacy.headers().location, legacy.url());
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("error")).toBe("credentials");

  const login = await request.get("/login", { maxRedirects: 0 });
  expect(login.status()).toBe(200);
  await page.goto("/sign-in?error=credentials");
  await expect(page).toHaveURL(/\/login\?error=credentials$/);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password." })).toBeVisible();
  await expect(page.locator(".workspace-sidebar, .workspace-mobile-header")).toHaveCount(0);
});

for (const path of [...workspaceModules.map(module => module.href), "/app", "/app/setup"]) {
  test(`signed-out ${path} redirects before returning private module markup`, async ({ request, page }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers().location).pathname).toBe("/login");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("workspace-sidebar");
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    await expect(page.locator(".workspace-sidebar, .workspace-mobile-header")).toHaveCount(0);
  });
}

test("the server protects POS even when JavaScript is disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/pos");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".workspace-sidebar, .workspace-mobile-header")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
