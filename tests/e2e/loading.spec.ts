import { expect, test, type Page } from "@playwright/test";

const id = "00000000-0000-4000-8000-000000000001";
async function catalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id, name: "LOGO Coffee" }, user_id: id, founder: true, categories: [],
    products: [{ id, name: "Latte", price_cents: 12000, cost_cents: 4000, active: true, sizes: [] }],
  } }));
}
async function holdMenu(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/menu\?.*_rsc=/, async route => { await gate; await route.continue(); });
  return release;
}

test("slow Next navigation keeps the same shell and global providers until the route commits", async ({ page }) => {
  const release = await holdMenu(page);
  await catalog(page);
  await page.goto("/pos");
  await expect(page.getByRole("article", { name: "Latte", exact: true })).toBeVisible();
  await page.locator(".workspace-sidebar").evaluate(el => { el.setAttribute("data-persistent", "yes"); });
  await page.getByRole("navigation", { name: "Shop", exact: true }).getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  await expect(page.locator(".workspace-sidebar")).toHaveAttribute("data-persistent", "yes");
  release();
  await expect(page.getByRole("heading", { name: "Menu Management", exact: true })).toBeVisible();
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
  await expect(page.locator(".workspace-sidebar")).toHaveAttribute("data-persistent", "yes");
  await expect(page.locator(".workspace-shell")).toHaveCount(1);
  await expect(page.locator(".global-loading-bar")).toHaveCount(1);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

test("a superseded navigation cannot strand the bar or replace the latest route", async ({ page }) => {
  const release = await holdMenu(page);
  await catalog(page);
  await page.goto("/pos");
  await expect(page.getByRole("article", { name: "Latte", exact: true })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Shop", exact: true });
  await nav.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  await nav.getByRole("link", { name: "Libraries", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Libraries", exact: true })).toBeVisible();
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
  release();
  await expect(page).toHaveURL(/\/libraries$/);
  await expect(page.getByRole("heading", { name: "Libraries", exact: true })).toBeVisible();
});

test("closing a tablet navigation drawer leaves the root-owned route loading signal alive", async ({ page }) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  const release = await holdMenu(page);
  await catalog(page);
  await page.goto("/pos");
  await expect(page.getByRole("article", { name: "Latte", exact: true })).toBeVisible();
  await page.locator(".workspace-mobile-header").evaluate(el => { el.setAttribute("data-persistent", "yes"); });
  await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Navigation menu" }).getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation menu" })).toHaveCount(0);
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  await expect(page.locator(".workspace-mobile-header")).toHaveAttribute("data-persistent", "yes");
  release();
  await expect(page.getByRole("heading", { name: "Menu Management", exact: true })).toBeVisible();
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
  await expect(page.locator(".workspace-mobile-header")).toHaveAttribute("data-persistent", "yes");
});
