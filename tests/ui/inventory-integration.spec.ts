import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";
import type { InventoryData } from "../../src/lib/inventory/domain";
import type { Product } from "../../src/lib/menu/domain";

const uid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const coffee = {
  id: uid(1),
  name: "Ground Coffee",
  item_type: "ingredient" as const,
  base_unit: "g" as const,
  minimum_stock: "100",
  notes: "",
  active: true,
  quantity: "2000",
  value_cents: 100000,
  unit_cost_cents: "50",
  revision: 1,
  has_movements: true,
  unit_locked: true,
};

function latte(): Product {
  return {
    id: uid(2),
    name: "Cafe Latte",
    price_cents: 12000,
    cost_cents: 5000,
    active: true,
    sizes: [
      { id: uid(3), label: "12 oz", price_cents: 12000, cost_cents: 5000, active: true, is_default: true },
      { id: uid(4), label: "16 oz", price_cents: 14500, cost_cents: 7000, active: true, is_default: false },
    ],
  };
}

async function setup(page: Page, product = latte()) {
  const data: InventoryData = { items: [coffee], configs: [], movements: [], returnable: [] };
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: { shop: { id: uid(10), name: "LOGO" }, user_id: uid(10), founder: true, products: [product], categories: [] },
      });
    }
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { data: { id: product.id } } });
  });
  await page.route("**/api/inventory*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data } });
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === "recipe") {
      const sizeKey = body.data.size_id ?? "";
      let config = data.configs.find(row => row.size_key === sizeKey);
      if (!config) {
        config = { product_id: product.id, size_key: sizeKey, revision: 0, active: null, draft: null };
        data.configs.push(config);
      }
      config.revision++;
      if (body.data.action === "draft") {
        config.draft = {
          id: uid(50),
          mode: "recipe",
          version: 1,
          components: [
            {
              ingredient_id: coffee.id,
              name: coffee.name,
              base_unit: "g",
              quantity: "18",
              active: true,
              unit_cost_cents: "50",
              component_cost_cents: "900",
            },
          ],
          cost_cents: 900,
          max_quantity: 100,
        };
        product.inventory = {
          ...(product.inventory ?? {}),
          [sizeKey || "regular"]: {
            state: config.active ? "active" : "draft",
            max_quantity: config.active ? 100 : null,
            cost_cents: config.active?.cost_cents ?? null,
            has_draft: true,
          },
        };
      }
      if (body.data.action === "activate") {
        config.active = config.draft;
        config.draft = null;
        product.inventory = {
          ...(product.inventory ?? {}),
          [sizeKey || "regular"]: {
            state: "active",
            max_quantity: 100,
            cost_cents: 900,
            has_draft: false,
            components: config.active?.components,
          },
        };
      }
      if (body.data.action === "deactivate") {
        config.active = null;
        product.inventory = {
          ...(product.inventory ?? {}),
          [sizeKey || "regular"]: {
            state: config.draft ? "draft" : "not_configured",
            max_quantity: null,
          },
        };
      }
    }
    return route.fulfill({ json: { data: {} } });
  });
  return { data, calls, product };
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1032, height: 1376 },
  { width: 768, height: 1024 },
  { width: 393, height: 852 },
]) {
  test(`per-size recipe discovery, cost breakdown, activation, and deactivation at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { calls, product } = await setup(page);
    await page.goto("/app/menu");

    // Verify Product Inventory Status starts as Not Configured and Manage Recipe button does not wrap
    const menuRegion = page.getByRole("region", { name: "Menu products", exact: true });
    await expect(menuRegion).toContainText("Not Configured");
    const manageButton = page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true });
    await expect(manageButton.locator(".button-idle")).toHaveText("");
    const actions = manageButton.locator("..");
    await expect(actions.getByRole("button")).toHaveCount(3);
    await expect(actions.getByRole("button").nth(0)).toHaveAccessibleName("Manage Recipe for Cafe Latte");
    await manageButton.scrollIntoViewIfNeeded();
    await actions.getByRole("button").nth(1).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(manageButton).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveText("Manage Recipe");
    const btnBox = await manageButton.boundingBox();
    expect(btnBox!.height).toBeLessThanOrEqual(48);

    const open = () => manageButton.click();
    await open();
    let dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
    await chooseOption(page, dialog.getByRole("combobox", { name: "Product size", exact: true }), "16 oz");
    await dialog.getByRole("button", { name: "Add component", exact: true }).click();
    await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory item", exact: true }), "Ground Coffee (g)");
    await dialog.getByLabel("Quantity (g)", { exact: true }).fill("18");
    await expect(dialog).toContainText("Unit cost: ₱0.50");
    await expect(dialog.locator(".recipe-line-cost output")).toHaveText("₱9.00");
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    expect(calls[0].data).toMatchObject({
      action: "draft",
      product_id: product.id,
      size_id: uid(4),
      components: [{ ingredient_id: coffee.id, quantity: "18" }],
    });
    expect(calls.some(call => call.data.action === "activate")).toBe(false);
    await expect(menuRegion).toContainText("Draft");

    // Review Cost Breakdown & Activate Recipe
    await open();
    dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
    await chooseOption(page, dialog.getByRole("combobox", { name: "Product size", exact: true }), "16 oz");
    const breakdown = dialog.getByRole("region", { name: "Saved recipe cost breakdown", exact: true });
    await expect(breakdown.getByText("Total Preparation Cost", { exact: true })).toBeVisible();
    await expect(breakdown.locator("details")).not.toHaveAttribute("open");
    await breakdown.getByText("Saved recipe breakdown", { exact: true }).click();
    await expect(breakdown).toContainText("Ground Coffee");
    await expect(breakdown).toContainText("18 g");
    await expect(breakdown).toContainText("₱9.00");
    await expect(breakdown).toContainText("₱136.00");
    await expect(breakdown).toContainText("Complete");
    await page.screenshot({
      path: `.local/ui-review/inventory/recipe-${viewport.width}.png`,
      animations: "disabled",
    });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    await dialog.getByRole("button", { name: "Activate saved draft", exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: "Activate saved recipe?", exact: true });
    await expect(confirmation).toBeVisible();
    expect(calls.some(call => call.data.action === "activate")).toBe(false);
    await confirmation.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls[1].data).toMatchObject({ action: "activate", size_id: uid(4), expected_revision: 1 });
    await expect(menuRegion).toContainText("Recipe Active");

    // Edit Product shows unconfigured 12 oz and read-only recipe cost for active 16 oz without duplicating ingredients.
    await page.getByRole("button", { name: "Edit Cafe Latte", exact: true }).click();
    const size1 = page.getByRole("group", { name: "Size 1", exact: true });
    await expect(size1).toContainText("Cost unavailable");
    await expect(page.getByLabel(/Manual Estimated Cost/)).toHaveCount(0);

    const size2 = page.getByRole("group", { name: "Size 2", exact: true });
    await expect(size2.locator("output")).toHaveText("\u20b19.00");
    await expect(size2).toContainText("Recipe Active");
    await expect(size2.getByLabel("Active recipe cost breakdown")).toHaveCount(0);
    await expect(size2.getByRole("button", { name: "View Recipe", exact: true })).toBeVisible();
    await page.screenshot({ path: `.local/ui-review/inventory/product-edit-${viewport.width}.png`, animations: "disabled" });
    await size2.getByLabel("Price (PHP)", { exact: true }).fill("155");
    await page.getByRole("button", { name: "Save product", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const save = calls.find(call => call.action === "product")!;
    expect((save.data.sizes as Product["sizes"])?.[1]).toMatchObject({ price_cents: 15500 });

    // Deactivation removes active recipe costing; sales stay blocked until a valid recipe is activated.
    await open();
    dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
    await chooseOption(page, dialog.getByRole("combobox", { name: "Product size", exact: true }), "16 oz");
    await dialog.getByText("Tracking settings", { exact: true }).click();
    await dialog.getByRole("button", { name: "Deactivate tracking", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: "Deactivate inventory tracking?", exact: true })
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(menuRegion).toContainText("Not Configured");
    await page.getByRole("button", { name: "Edit Cafe Latte", exact: true }).click();
    await expect(page.getByRole("group", { name: "Size 2", exact: true })).toContainText("Cost unavailable");
    await expect(page.getByLabel(/Manual Estimated Cost/)).toHaveCount(0);
    expect((save.data.sizes as Product["sizes"])?.[1]).not.toHaveProperty("cost_cents");

  });
}

test("POS blocks only the short size and preserves recipe availability and quantity limits", async ({ page }) => {
  const product = latte();
  product.inventory = {
    [uid(3)]: { state: "active", max_quantity: 0, cost_cents: 900 },
    [uid(4)]: { state: "active", max_quantity: 1, cost_cents: 1200 },
  };
  await setup(page, product);
  await page.goto("/pos");
  const card = page.getByRole("article", { name: "Cafe Latte", exact: true });
  await expect(card).toContainText("Out of stock");
  await expect(card.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
  await card.getByRole("radio", { name: "16 oz", exact: true }).check();
  await expect(card).toContainText("Available");
  await card.getByRole("button", { name: /Add to cart/ }).click();
  await expect(page.getByRole("button", { name: "Increase Cafe Latte 16 oz", exact: true })).toBeDisabled();
  await expect(card).toContainText("1 in cart");
  await expect(page.locator(".pos-total")).toContainText("₱145.00");
  await page.getByRole("button", { name: "Remove Cafe Latte 16 oz from cart", exact: true }).click();
  await expect(card.getByRole("button", { name: /Add to cart/ })).toBeEnabled();
});

test("a stale physical count stays unsaved and preserves its review for correction", async ({ page }) => {
  const { calls } = await setup(page);
  await page.route("**/api/inventory", async route =>
    route.fulfill({
      status: 422,
      json: { error: "Stock changed after this count was opened. Refresh and count again." },
    }),
  );
  await page.goto("/app/inventory");
  await page.getByRole("row", { name: "Open Ground Coffee details", exact: true }).click();
  await page.getByRole("button", { name: /Count Stock/ }).click();
  await page.getByLabel("Actual physical quantity", { exact: true }).fill("1900");
  await page.getByLabel("Reason", { exact: true }).fill("Physical stock discrepancy");
  await page.getByRole("button", { name: "Review Count", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Stock changed");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(calls).toHaveLength(0);
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Actual physical quantity", { exact: true })).toHaveValue("1900");
});
