import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";
import type { InventoryData } from "../../src/lib/inventory/domain";
import type { Product } from "../../src/lib/menu/domain";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function setup(page: Page, missingCost = false, founder = true) {
  const items: InventoryData["items"] = Array.from({ length: 6 }, (_, n) => ({
    id: id(n + 1), name: n ? `Ingredient ${n + 1}` : "Ground Coffee with a long descriptive inventory item name",
    item_type: "ingredient", base_unit: "g", quantity: "1000", minimum_stock: "10",
    unit_cost_cents: missingCost && n === 0 ? null : "100", value_cents: 100000,
    notes: "", active: true, revision: 1, has_movements: true,
  }));
  const product: Product = {
    id: id(20), name: "Cafe Latte", description: "Espresso and steamed milk", active: true, price_cents: 12000,
    sizes: [
      { id: id(21), label: "12 oz", active: true, is_default: true, price_cents: 12000, cost_cents: null },
      { id: id(22), label: "16 oz", active: true, is_default: false, price_cents: 14500, cost_cents: null },
    ],
    inventory: { [id(22)]: { state: "active", max_quantity: 1000, cost_cents: missingCost ? null : 600 } },
  };
  const recipe = {
    id: id(30), mode: "recipe" as const, version: 3, cost_cents: missingCost ? null : 600, max_quantity: 1000,
    components: items.map(item => ({ ingredient_id: item.id, name: item.name, base_unit: item.base_unit,
      quantity: "1.000000", active: true, unit_cost_cents: item.unit_cost_cents,
      component_cost_cents: item.unit_cost_cents })),
  };
  const data: InventoryData = { items, movements: [], returnable: [],
    configs: [{ product_id: product.id, size_key: id(22), revision: 7, active: recipe, draft: null }] };
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  let inventoryReads = 0;
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: id(99), name: "LOGO" }, user_id: id(99), founder, products: [product], categories: [],
  } }));
  await page.route("**/api/inventory*", route => {
    if (route.request().method() === "GET") {
      inventoryReads++;
      return route.fulfill({ json: { data } });
    }
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 422, json: { error: "Recipe changed. Refresh before saving." } });
  });
  return { data, product, calls, reads: () => inventoryReads };
}

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 },
  { width: 768, height: 1024 }, { width: 393, height: 852 },
]) test(`compact product and multi-component recipe fit ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const fixture = await setup(page);
  await page.goto("/app/menu");
  await expect(page.getByRole("region", { name: "Menu products", exact: true })).toContainText("Recipe Active");
  const table = page.getByRole("region", { name: "Menu products", exact: true });
  await expect(table.locator('thead th').filter({ hasText: /^Recipe Status$/ })).toHaveCount(1);
  await expect(table.locator('tbody td[data-label="Recipe Status"]')).toContainText("Recipe Active");
  await expect(table.locator('.table-cell-primary .menu-inventory-status')).toHaveCount(0);
  if (viewport.width >= 768) {
    const head = await table.locator('thead th').filter({ hasText: /^Recipe Status$/ }).boundingBox();
    const cell = await table.locator('tbody td[data-label="Recipe Status"]').boundingBox();
    expect(Math.abs(head!.x - cell!.x)).toBeLessThan(1);
    expect(Math.abs(head!.width - cell!.width)).toBeLessThan(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/ui-review/menu-recipes/menu-${viewport.width}.png`, fullPage: true, animations: "disabled" });
  const edit = page.getByRole("button", { name: "Edit Cafe Latte", exact: true });
  await edit.click();
  const product = page.getByRole("dialog", { name: "Edit product", exact: true });
  const size = product.getByRole("group", { name: "Size 2", exact: true });
  await expect(size.getByLabel("Calculated Preparation Cost", { exact: true })).toHaveText("₱6.00");
  await expect(product.getByLabel(/Manual Estimated Cost/)).toHaveCount(0);
  await expect(product.locator(".product-cost-components")).toHaveCount(0);
  expect(fixture.reads()).toBe(0);
  await size.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.local/ui-review/menu-recipes/product-${viewport.width}.png`, animations: "disabled" });
  await size.getByRole("button", { name: "View Recipe", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("combobox", { name: "Product size", exact: true })).toHaveText("16 oz");
  await expect(dialog.locator(".dialog-heading")).toContainText("Recipe Active");
  const summary = dialog.getByRole("region", { name: "Saved recipe cost breakdown", exact: true });
  await expect(summary).toContainText("₱139.00");
  await expect(summary.locator("details")).not.toHaveAttribute("open");
  await expect(dialog.getByRole("group", { name: /^Component / })).toHaveCount(6);
  const first = dialog.getByRole("group", { name: "Component 1", exact: true });
  await expect(first.locator(".recipe-line-cost output")).toHaveText("₱1.00");
  expect((await first.boundingBox())!.height).toBeLessThan(viewport.width < 768 ? 210 : 150);
  await page.screenshot({ path: `.local/ui-review/menu-recipes/recipe-${viewport.width}.png`, animations: "disabled" });
  if (viewport.width < 768) {
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/ui-review/menu-recipes/recipe-ingredients-${viewport.width}.png`, animations: "disabled" });
  }
  for (const el of await dialog.locator("input, [role=combobox], fieldset").all()) {
    expect(await el.evaluate(node => node.getBoundingClientRect().right <= innerWidth)).toBe(true);
  }
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const save = dialog.getByRole("button", { name: "Save draft", exact: true });
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThan(viewport.height);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(fixture.calls).toHaveLength(0);
});

test("View Recipe respects unsaved product edits and uses the selected saved size", async ({ page }) => {
  const fixture = await setup(page);
  await page.goto("/app/menu");
  const edit = page.getByRole("button", { name: "Edit Cafe Latte", exact: true });
  await edit.click();
  const product = page.getByRole("dialog", { name: "Edit product", exact: true });
  await product.getByLabel("Product name", { exact: true }).fill("Unsaved latte");
  const view = product.getByRole("group", { name: "Size 2", exact: true }).getByRole("button", { name: "View Recipe", exact: true });
  await view.click();
  const discard = page.getByRole("alertdialog", { name: "Discard your changes?", exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(product.getByLabel("Product name", { exact: true })).toHaveValue("Unsaved latte");
  // Cancelling a requested transition must not schedule a later surprise recipe opening.
  await product.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await edit.click();
  await product.getByLabel("Product name", { exact: true }).fill("Another unsaved latte");
  await view.click();
  await discard.getByRole("button", { name: "Discard changes", exact: true }).click();
  const recipe = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(recipe.getByRole("combobox", { name: "Product size", exact: true })).toHaveText("16 oz");
  await recipe.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edit).toBeFocused();
  expect(fixture.calls).toHaveLength(0);
});

test("view-only staff retain their existing menu visibility without owner recipe details", async ({ page }) => {
  await setup(page, false, false);
  await page.goto("/app/menu");
  const table = page.getByRole("region", { name: "Menu products", exact: true });
  await expect(table).toContainText("Cafe Latte");
  await expect(table.locator('thead th').filter({ hasText: /^Recipe Status$/ })).toHaveCount(0);
  await expect(table.locator('.menu-inventory-status')).toHaveCount(0);
  await expect(table.getByRole("button", { name: /Manage Recipe/ })).toHaveCount(0);
});

test("missing costs remain visible and failed draft saves retain inputs and revision", async ({ page }) => {
  const { calls } = await setup(page, true);
  await page.goto("/app/menu");
  await expect(page.getByRole("region", { name: "Menu products", exact: true })).toContainText("Needs Attention");
  await page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await chooseOption(page, dialog.getByRole("combobox", { name: "Product size", exact: true }), "16 oz");
  await expect(dialog.getByRole("region", { name: "Saved recipe cost breakdown", exact: true })).toContainText("Incomplete");
  const part = dialog.getByRole("group", { name: "Component 1", exact: true });
  await expect(part.locator(".recipe-line-cost output")).toHaveText("Missing cost");
  await part.getByLabel("Quantity (g)", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Recipe changed");
  await expect(part.getByLabel("Quantity (g)", { exact: true })).toHaveValue("2");
  expect(calls[0].data).toMatchObject({ size_id: id(22), expected_revision: 7, action: "draft" });
  expect((calls[0].data.components as { quantity: string }[])[0].quantity).toBe("2");
  expect(calls).toHaveLength(1);
});


test("recipe loading and load failure retain an explicit Cancel action without a header close button", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  let loading = true;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/inventory*", async route => {
    if (loading) await gate;
    await route.fulfill({ status: 503, json: { error: "Inventory is temporarily unavailable." } });
  });
  await page.goto("/app/menu");
  const trigger = page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true });
  await trigger.click();
  const recipe = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await expect(recipe.getByRole("status")).toContainText("Loading inventory configuration");
  await expect(recipe.getByRole("button", { name: "Close dialog", exact: true })).toHaveCount(0);
  await recipe.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(recipe).toHaveCount(0);
  await expect(trigger).toBeFocused();
  loading = false;
  release();
  await trigger.click();
  await expect(recipe.getByRole("alert")).toContainText("Inventory is temporarily unavailable");
  await recipe.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(recipe).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Add product provides a guided Save & Configure Recipe workflow", async ({ page }) => {
  await setup(page);
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: { data: { id: id(40) } } });
    }
    return route.fulfill({
      json: {
        shop: { id: id(99), name: "LOGO" },
        user_id: id(99),
        founder: true,
        products: [],
        categories: [],
      },
    });
  });
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add product", exact: true });
  await expect(dialog.getByRole("button", { name: "Save product", exact: true })).toBeVisible();
  const saveAndRecipe = dialog.getByRole("button", { name: "Save & Configure Recipe", exact: true });
  await expect(saveAndRecipe).toBeVisible();
  await dialog.getByLabel("Product name", { exact: true }).fill("Matcha Latte");
  await dialog.getByLabel("Selling price (PHP)", { exact: true }).fill("150");
  await saveAndRecipe.click();
  const recipe = page.getByRole("dialog", { name: "Recipe · Matcha Latte", exact: true });
  await expect(recipe).toBeVisible();
  await recipe.getByRole("button", { name: "Cancel", exact: true }).click();
});
