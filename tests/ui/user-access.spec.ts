import { expect, test } from "@playwright/test";
const owner = "00000000-0000-4000-8000-000000008801", staff = "00000000-0000-4000-8000-000000008802";
const data = { user_id: owner, members: [
  { id: owner, user_id: owner, email: "owner@example.test", display_name: "Shop Owner", role: "founder", status: "active", permissions: null, created_at: "2026-11-14" },
  { id: staff, user_id: staff, email: "staff@example.test", display_name: "Counter Staff", role: "staff", status: "active", permissions: { pos: ["view", "checkout"] }, created_at: "2026-11-14" },
], invitations: [] };

test("owners edit module and action access independently and protect owner accounts", async ({ page }) => {
  const mutations: Record<string, unknown>[] = [];
  await page.route("**/api/users", async route => {
    if (route.request().method() === "POST") { mutations.push(route.request().postDataJSON()); return route.fulfill({ json: { data: {} } }); }
    return route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/users");
  await expect(page.getByRole("heading", { name: "User Management", exact: true })).toBeVisible();
  await expect(page.locator(".workspace-sidebar").getByRole("link", { name: "User Management", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Edit access for owner@example.test" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit access for staff@example.test" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit user access", exact: true });
  await expect(dialog.getByRole("checkbox", { name: "Menu: Add", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Menu: View", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Menu: Add", exact: true }).check();
  await expect(dialog.getByRole("checkbox", { name: "Menu: Edit", exact: true })).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "POS: View", exact: true }).uncheck();
  await expect(dialog.getByRole("checkbox", { name: "POS: Complete sales", exact: true })).not.toBeChecked();
  await dialog.getByRole("button", { name: "Save access", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(mutations).toEqual([{ action: "update", id: staff, status: "active", permissions: { pos: [], menu: ["view", "create"] } }]);
});

test("invitation permission form fits mobile and saves only selected grants", async ({ page }, info) => {
  let mutation: Record<string, unknown> | undefined;
  await page.route("**/api/users", route => {
    if (route.request().method() === "POST") { mutation = route.request().postDataJSON(); return route.fulfill({ json: { data: { token: owner } } }); }
    return route.fulfill({ json: { data } });
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/app/users");
  await page.getByRole("button", { name: "Invite user", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invite user", exact: true });
  await dialog.getByLabel("Email address", { exact: true }).fill("new@example.test");
  await dialog.getByRole("checkbox", { name: "Expenses: View", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Expenses: Add", exact: true }).check();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("user-access-mobile.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Create invitation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(mutation).toEqual({ action: "invite", email: "new@example.test", permissions: { pos: ["view", "checkout"], expenses: ["view", "create"] } });
});

test("staff see only allowed navigation and product actions", async ({ page }) => {
  const access = { role: "staff", permissions: { menu: ["view", "edit"], libraries: ["view"] } };
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: owner, name: "Sip&Snap" }, user_id: staff, founder: false, access,
    categories: [{ id: owner, name: "Coffee" }], products: [{ id: owner, name: "Latte", price_cents: 100, active: true, category_id: owner, sizes: [] }],
  } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/app/menu?access=${encodeURIComponent(JSON.stringify(access))}`);
  const sidebar = page.locator(".workspace-sidebar");
  await expect(sidebar.getByRole("link", { name: "Menu", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Libraries", exact: true })).toBeVisible();
  for (const name of ["Dashboard", "POS", "Inventory", "Sales", "Expenses", "User Management"]) await expect(sidebar.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit Latte", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add product", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete product Latte", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage Recipe for Latte", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Latte", exact: true }).click();
  await expect(page.getByRole("button", { name: "View Recipe", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save & Configure Recipe", exact: true })).toHaveCount(0);
});

test("view-only staff cannot add, edit, or delete expenses", async ({ page }) => {
  const access = { role: "staff", permissions: { expenses: ["view"] } };
  await page.goto(`/expenses?staff&access=${encodeURIComponent(JSON.stringify(access))}`);
  await expect(page.getByRole("heading", { name: "Expenses Management", exact: true })).toBeVisible();
  await expect(page.getByText("You have view-only access to expenses.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Add expense|Edit expense|Delete expense/ })).toHaveCount(0);
});

test("inventory grants separate stock changes from item maintenance and returns", async ({ page }) => {
  const access = { role: "staff", permissions: { inventory: ["view", "stock"] } };
  await page.route("**/api/inventory*", route => route.fulfill({ json: { data: {
    items: [{ id: owner, name: "Coffee", item_type: "ingredient", base_unit: "g", minimum_stock: "0", notes: "", active: true, quantity: "100", value_cents: 100, unit_cost_cents: "1", revision: 1, has_movements: true, unit_locked: true }],
    configs: [], returnable: [], movements: [],
  } } }));
  await page.goto(`/app/inventory?access=${encodeURIComponent(JSON.stringify(access))}`);
  await expect(page.getByRole("button", { name: "Stock In for Coffee", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Item", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Return to Stock", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "More actions for Coffee", exact: true }).click();
  await expect(page.getByRole("button", { name: "Count Stock for Coffee", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit inventory item Coffee", exact: true })).toHaveCount(0);
});

test("POS View alone cannot complete a sale", async ({ page }) => {
  const access = { role: "staff", permissions: { pos: ["view"] } };
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: owner, name: "Sip&Snap" }, user_id: staff, founder: false, access, categories: [],
    products: [{ id: owner, name: "Latte", price_cents: 100, active: true, sizes: [], inventory: { regular: { state: "active", max_quantity: 10, cost_cents: 50 } } }],
  } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/pos?access=${encodeURIComponent(JSON.stringify(access))}`);
  await page.getByRole("button", { name: /Latte.*Add to cart/ }).click();
  await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeDisabled();
});
