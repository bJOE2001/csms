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
      if (body.data.expected_revision !== config.revision) return route.fulfill({ status: 422, json: { error: "Recipe changed. Reopen it before saving." } });
      config.revision++;
      if (body.data.action === "draft") {
        config.draft = {
          id: uid(50),
          mode: body.data.mode,
          version: 1,
          components: body.data.components.map((part: { ingredient_id: string; quantity: string }) => {
            const item = data.items.find(item => item.id === part.ingredient_id)!;
            return { ...part, name: item.name, base_unit: item.base_unit, active: item.active,
              unit_cost_cents: item.unit_cost_cents,
              component_cost_cents: item.unit_cost_cents === null ? null : String(Number(part.quantity) * Number(item.unit_cost_cents)) };
          }),
          cost_cents: Math.ceil(body.data.components.reduce((sum: number, part: { ingredient_id: string; quantity: string }) =>
            sum + Number(part.quantity) * Number(data.items.find(item => item.id === part.ingredient_id)!.unit_cost_cents), 0)),
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
            cost_cents: config.active?.cost_cents ?? null,
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
    await expect(menuRegion.locator(".menu-availability")).toHaveText("Unavailable");
    await page.screenshot({ path: `.local/ui-review/menu-recipes/no-recipe-${viewport.width}.png`, animations: "disabled" });
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

    expect(calls.some(call => call.data.action === "activate")).toBe(false);
    await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
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
    await expect(dialog.getByRole("button", { name: "Deactivate Recipe", exact: true })).not.toBeVisible();
    await dialog.getByText("Advanced settings", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.screenshot({ path: `.local/ui-review/inventory/recipe-settings-${viewport.width}.png`, animations: "disabled" });
    await dialog.getByRole("button", { name: "Deactivate Recipe", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: "Deactivate recipe?", exact: true })
      .getByRole("button", { name: "Confirm", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(menuRegion).toContainText("Not Configured");
    await page.getByRole("button", { name: "Edit Cafe Latte", exact: true }).click();
    await expect(page.getByRole("group", { name: "Size 2", exact: true })).toContainText("Cost unavailable");
    await expect(page.getByLabel(/Manual Estimated Cost/)).toHaveCount(0);
    expect((save.data.sizes as Product["sizes"])?.[1]).not.toHaveProperty("cost_cents");

    await page.getByRole("dialog", { name: "Edit product", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
    product.sizes = [];
    product.inventory = { regular: { state: "draft", max_quantity: null } };
    await page.goto("/app/menu");
    await expect(menuRegion.locator('.menu-inventory-status')).toHaveText("Draft");
    await expect(menuRegion.locator(".menu-availability")).toHaveText("Unavailable");
    await page.screenshot({ path: `.local/ui-review/menu-recipes/draft-${viewport.width}.png`, animations: "disabled" });

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
  await expect(card).toContainText("Insufficient stock");
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
  await page.getByRole("button", { name: "More actions for Ground Coffee", exact: true }).click();
  await page.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true }).click();
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 393, height: 852 }])
test(`selling switches preserve recipes and explain each size's POS eligibility at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const product = latte();
  product.active = false;
  product.inventory = {
    [uid(3)]: { state: "active", max_quantity: 100, cost_cents: 900 },
    [uid(4)]: { state: "active", max_quantity: 100, cost_cents: 1100 },
  };
  const inventory = structuredClone(product.inventory);
  const { calls } = await setup(page, product);
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fallback();
    const body = route.request().postDataJSON();
    calls.push(body);
    const saved = body.data as Product;
    product.active = saved.active;
    product.sizes = saved.sizes?.map(size => ({ ...product.sizes!.find(existing => existing.id === size.id)!, ...size }));
    await route.fulfill({ json: { data: { id: product.id } } });
  });
  await page.goto("/app/menu");
  const row = page.getByRole("row").filter({ hasText: "Cafe Latte" });
  await expect(row.locator(".menu-availability-reason")).toHaveText("Disabled by owner");
  await expect(row).toContainText("Recipe Active");
  await page.getByRole("button", { name: "Edit Cafe Latte", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit product", exact: true });
  await edit.getByLabel("Available for sale", { exact: true }).check();
  await edit.getByRole("group", { name: "Size 1", exact: true }).getByLabel("Size available", { exact: true }).uncheck();
  await edit.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect(calls[0]).toMatchObject({ action: "product", data: { active: true, sizes: [{ active: false }, { active: true }] } });
  expect(product.inventory).toEqual(inventory);
  await expect(row.locator(".menu-availability")).toHaveText("Available");
  await expect(row.locator(".menu-size-list")).toContainText("12 oz · Default · Size disabled by owner");

  await page.goto("/pos");
  const card = page.getByRole("article", { name: "Cafe Latte", exact: true });
  await expect(card.getByRole("radio", { name: "12 oz — Unavailable", exact: true })).toBeDisabled();
  await expect(card.getByRole("radio", { name: "16 oz", exact: true })).toBeChecked();
  await expect(card.locator(".product-availability")).toHaveText("Available");

  product.sizes![0].active = true;
  product.inventory![uid(3)] = { state: "not_configured", max_quantity: null };
  product.inventory![uid(4)] = { state: "active", max_quantity: 0, cost_cents: 1100 };
  await page.reload();
  await expect(card.locator(".product-availability")).toHaveText("Recipe missing");
  await expect(card.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
  await card.getByRole("radio", { name: "16 oz", exact: true }).check();
  await expect(card.locator(".product-availability")).toHaveText("Insufficient stock");
  await expect(card.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
  await page.screenshot({ path: `.local/ui-review/availability/pos-${viewport.width}.png`, animations: "disabled" });

  await page.goto("/app/menu");
  await expect(row.locator(".menu-availability-reason")).toHaveText("Sizes unavailable");
  await expect(row.locator(".menu-size-list")).toContainText("12 oz · Default · Recipe missing");
  await expect(row.locator(".menu-size-list")).toContainText("16 oz · Insufficient stock");
  await page.screenshot({ path: `.local/ui-review/availability/menu-${viewport.width}.png`, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls.filter(call => call.action === "recipe")).toHaveLength(0);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 393, height: 852 }])
test(`Save & Activate sets up a new recipe in one action at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const { calls, product, data } = await setup(page);
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await dialog.getByRole("button", { name: "Add component", exact: true }).click();
  await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory item", exact: true }), "Ground Coffee (g)");
  await dialog.getByLabel("Quantity (g)", { exact: true }).fill("22");
  const save = dialog.getByRole("button", { name: "Save & Activate", exact: true });
  await expect(save).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Save draft", exact: true })).toBeVisible();
  await page.screenshot({ path: `.local/ui-review/recipe-save/one-action-${viewport.width}.png`, animations: "disabled" });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(calls.map(call => call.data.action)).toEqual(["draft", "activate"]);
  expect(calls[0].data).toMatchObject({ expected_revision: 0, size_id: uid(3), components: [{ ingredient_id: coffee.id, quantity: "22" }] });
  expect(calls[1].data).toMatchObject({ expected_revision: 1, size_id: uid(3) });
  expect(calls[0].data.operation_id).not.toBe(calls[1].data.operation_id);
  expect(data.configs[0].active?.components[0].quantity).toBe("22");
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText("Recipe saved and activated");
  expect(product.inventory?.[uid(3)]?.state).toBe("active");
});

test("Save & Activate retries only activation and uses changed fields on a subsequent save", async ({ page }) => {
  const { calls, data } = await setup(page);
  let failedActivation: Record<string, unknown> | undefined;
  let fail = true;
  await page.route("**/api/inventory*", route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      if (body.data.action === "activate" && fail) {
        failedActivation = body.data;
        return route.fulfill({ status: 422, json: { error: "Inventory cost is temporarily unavailable." } });
      }
    }
    return route.fallback();
  });
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await dialog.getByRole("button", { name: "Add component", exact: true }).click();
  await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory item", exact: true }), "Ground Coffee (g)");
  await dialog.getByLabel("Quantity (g)", { exact: true }).fill("18");
  await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Draft saved. Activation failed:");
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Retry activation", exact: true })).toBeEnabled();
  expect(calls.map(call => call.data.action)).toEqual(["draft"]);
  fail = false;
  await dialog.getByRole("button", { name: "Retry activation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.map(call => call.data.action)).toEqual(["draft", "activate"]);
  expect(calls[1].data).toEqual(failedActivation);
  expect(data.configs[0].active).not.toBeNull();

  await page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true }).click();
  await dialog.getByLabel("Quantity (g)", { exact: true }).fill("20");
  fail = true;
  await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Draft saved. Activation failed:");
  await dialog.getByLabel("Quantity (g)", { exact: true }).fill("24");
  fail = false;
  await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls.at(-2)?.data).toMatchObject({ action: "draft", expected_revision: 3, components: [{ quantity: "24" }] });
  expect(calls.at(-1)?.data).toMatchObject({ action: "activate", expected_revision: 4 });
  expect(data.configs[0].active?.components[0].quantity).toBe("24");
});

test("Save & Activate respects validation, keyboard submit, and pending submission locks", async ({ page }) => {
  const { calls } = await setup(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route("**/api/inventory*", async route => {
    if (route.request().method() === "POST") { writes++; await hold; }
    return route.fallback();
  });
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Manage Recipe for Cafe Latte", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Cafe Latte", exact: true });
  await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Add at least one component");
  expect(writes).toBe(0);
  await dialog.getByRole("button", { name: "Add component", exact: true }).click();
  await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory item", exact: true }), "Ground Coffee (g)");
  const quantity = dialog.getByLabel("Quantity (g)", { exact: true });
  await quantity.fill("18");
  await quantity.press("Enter");
  await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close dialog", exact: true })).toBeDisabled();
  await dialog.locator("form").dispatchEvent("submit");
  expect(writes).toBe(1);
  release();
  await expect(dialog).toHaveCount(0);
  expect(calls.map(call => call.data.action)).toEqual(["draft", "activate"]);
});

test("Save & Activate supports finished goods without adding a size", async ({ page }) => {
  const product: Product = { id: uid(2), name: "Brownie", price_cents: 8000, active: true, sizes: [] };
  const { data, calls } = await setup(page, product);
  const brownie = { ...coffee, id: uid(20), name: "Brownie", item_type: "finished_good" as const, base_unit: "each" as const, quantity: "84", unit_cost_cents: "3000" };
  data.items.push(brownie);
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Manage Recipe for Brownie", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Recipe · Brownie", exact: true });
  await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory mode", exact: true }), "Finished-good tracking (ready-to-sell item)");
  await dialog.getByRole("button", { name: "Add component", exact: true }).click();
  await chooseOption(page, dialog.getByRole("combobox", { name: "Inventory item", exact: true }), "Brownie (pcs)");
  await dialog.getByLabel("Quantity (pcs)", { exact: true }).fill("1");
  await dialog.getByRole("button", { name: "Save & Activate", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(calls[0].data).toMatchObject({ action: "draft", size_id: null, mode: "finished_good", components: [{ ingredient_id: brownie.id, quantity: "1" }] });
  expect(calls[1].data).toMatchObject({ action: "activate", size_id: null, expected_revision: 1 });
  expect(data.configs[0].active?.mode).toBe("finished_good");
});
