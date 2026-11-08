import { expect, test, type Page } from "@playwright/test";
import type { InventoryData, Movement } from "../../src/lib/inventory/domain";
import { chooseOption } from "../helpers/select";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function setup(page: Page, empty = false) {
  const data: InventoryData = {
    items: empty ? [] : [
      { id: uid(1), name: "Ground Coffee", item_type: "ingredient", base_unit: "g", minimum_stock: "100.000000", notes: "Keep sealed after opening.", active: true, quantity: "2000", value_cents: 100000, unit_cost_cents: "50", revision: 7, has_movements: true },
      { id: uid(2), name: "12 oz Cup", item_type: "supply", base_unit: "each", minimum_stock: "20.000000", notes: "", active: true, quantity: "20", value_cents: 6000, unit_cost_cents: "300", revision: 1, has_movements: true },
      { id: uid(3), name: "Fresh Milk — Unsweetened Barista Blend for Coffee and Chocolate Drinks", item_type: "ingredient", base_unit: "ml", minimum_stock: "500", notes: "", active: true, quantity: "0", value_cents: 0, unit_cost_cents: null, revision: 1, has_movements: true },
      { id: uid(4), name: "Brownie", item_type: "finished_good", base_unit: "each", minimum_stock: "10", notes: "", active: true, quantity: "12", value_cents: 36000, unit_cost_cents: "3000", revision: 1, has_movements: true },
    ],
    configs: [],
    movements: empty ? [] : ([
      { id: uid(101), ingredient_id: uid(1), name: "Ground Coffee", base_unit: "g", kind: "receipt", quantity_delta: "1000", resulting_quantity: "2000", value_delta_cents: 50000, reason: "Stock received", reference: "DR-501", supplier: "Local Coffee Supply", notes: "Keep delivery record." },
      { id: uid(102), ingredient_id: uid(1), name: "Ground Coffee", base_unit: "g", kind: "sale", quantity_delta: "-18", resulting_quantity: "1982", value_delta_cents: -900, reason: "Sale consumption" },
      { id: uid(103), ingredient_id: uid(2), name: "12 oz Cup", base_unit: "each", kind: "waste", quantity_delta: "-1", resulting_quantity: "20", value_delta_cents: -300, reason: "Damaged packaging" },
    ] as Partial<Movement>[]).map(row => ({ occurred_on: "2026-11-07", created_at: "2026-11-07T10:00:00Z", created_by: uid(9), source_id: uid(201), previous_quantity: "1000", ...row } as Movement)),
    returnable: empty ? [] : [{ id: uid(301), receipt: "ABC12345", ingredient_name: "Brownie", remaining_quantity: "1", base_unit: "each" }],
  };
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const requests: string[] = [];
  const state: { fail: boolean; beforeWrite?: Promise<void>; afterWrite?: () => void } = { fail: false };
  await page.route("**/api/inventory*", async route => {
    if (route.request().method() === "GET") {
      requests.push(route.request().url());
      return route.fulfill({ json: { data } });
    }
    calls.push(route.request().postDataJSON());
    await state.beforeWrite;
    if (!state.fail) state.afterWrite?.();
    return route.fulfill(state.fail ? { status: 409, json: { error: "Stock changed. Refresh and recount." } } : { json: { data: {} } });
  });
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: uid(9), name: "LOGO" }, user_id: uid(9), founder: true, categories: [],
    products: [{ id: uid(50), name: "Americano", price_cents: 9500, active: true, sizes: [] }],
  } }));
  return { data, calls, requests, state };
}

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 393, height: 852 },
];
for (const viewport of viewports) {
  test(`inventory overview, history and dialogs fit ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await setup(page);
    await page.goto("/app/inventory");
    await expect(page.locator(".inventory-header-actions").getByRole("button", { name: "Stock In", exact: true })).toHaveCount(0);
    const overview = page.getByLabel("Current inventory overview");
    await expect(overview.locator("dt")).toHaveText(["Total Items", "Low Stock", "Out of Stock", "Inventory Value"]);
    await expect(overview).toContainText("₱1,420.00");
    const navigation = page.getByRole("navigation", { name: "Inventory views" });
    await expect(navigation.getByRole("button")).toHaveCount(2);
    await expect(navigation.getByRole("button", { name: "Stock Items", exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "History", exact: true })).toBeVisible();
    const row = page.getByRole("row", { name: "Open Ground Coffee details" });
    await expect(row).toContainText("In Stock");
    await page.screenshot({ path: `.local/ui-review/inventory/refined-items-${viewport.width}.png`, animations: "disabled" });
    await row.focus(); await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: "Ground Coffee", exact: true });
    await expect(detail).toContainText("2,000 g");
    await expect(detail.getByRole("button", { name: "View History", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Count Stock", exact: true })).toHaveCount(0);
    await expect(detail.locator(".dialog-footer")).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-details-${viewport.width}.png`, animations: "disabled" });
    await detail.getByRole("button", { name: "Close dialog", exact: true }).click();
    const more = row.getByRole("button", { name: "More actions for Ground Coffee", exact: true });
    await expect(row.getByRole("group", { name: "Actions for Ground Coffee", exact: true }).getByRole("button")).toHaveCount(2);
    await expect(row.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true })).toHaveCount(0);
    await more.focus(); await page.keyboard.press("Enter");
    const actions = page.getByRole("dialog", { name: "More actions for Ground Coffee", exact: true });
    await expect(actions).toBeInViewport();
    await expect(actions.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true })).toBeFocused();
    await expect(actions.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true })).toHaveAccessibleDescription("Enter your actual physical count.");
    await page.keyboard.press("Tab");
    await expect(actions.getByRole("button", { name: "Adjust Stock for Ground Coffee", exact: true })).toBeFocused();
    await expect(actions.getByRole("button", { name: "Adjust Stock for Ground Coffee", exact: true })).toHaveAccessibleDescription("Record damage, wastage, or corrections.");
    await page.keyboard.press("Tab");
    await expect(actions.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true })).toBeFocused();
    await page.screenshot({ path: `.local/ui-review/inventory/refined-more-actions-${viewport.width}.png`, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(actions).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(detail).toHaveCount(0);
    await more.click();
    await actions.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true }).click();
    const count = page.getByRole("dialog", { name: "Count Stock", exact: true });
    await expect(page.locator(".app-dialog")).toHaveCount(1);
    await count.getByLabel("Actual physical quantity", { exact: true }).fill("1900");
    await expect(count.getByLabel("Physical count comparison")).toContainText("-100 g");
    await expect(count.getByRole("button", { name: "Review Count", exact: true })).toBeInViewport();
    expect(await count.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-count-${viewport.width}.png`, animations: "disabled" });
    await count.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(detail).toHaveCount(0);
    await expect(more).toBeFocused();
    await more.click();
    await page.getByRole("button", { name: "Adjust Stock for Ground Coffee", exact: true }).click();
    const adjust = page.getByRole("dialog", { name: "Adjust Stock", exact: true });
    await adjust.getByLabel("Quantity to deduct", { exact: true }).fill("50");
    await expect(adjust.getByRole("button", { name: "Review Adjustment", exact: true })).toBeInViewport();
    expect(await adjust.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-adjust-${viewport.width}.png`, animations: "disabled" });
    await adjust.getByRole("button", { name: "Cancel", exact: true }).click();
    await more.click();
    await page.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true }).click();
    const edit = page.getByRole("dialog", { name: "Edit Inventory Item", exact: true });
    await expect(edit).not.toContainText("Show a warning when available quantity reaches this amount.");
    await expect(edit).not.toContainText("Cups, lids, straws");
    await expect(edit.locator(".dialog-heading p")).toHaveCount(0);
    await expect(edit.locator("input[placeholder], textarea[placeholder]")).toHaveCount(0);
    await expect(edit.getByLabel("Low-stock threshold", { exact: true })).toHaveValue("100");
    await expect(edit.getByRole("combobox", { name: "Base unit", exact: true })).toBeDisabled();
    expect(await edit.locator("[aria-describedby]").evaluateAll(nodes => nodes.every(node =>
      node.getAttribute("aria-describedby")!.split(/\s+/).every(id => !!document.getElementById(id)),
    ))).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-edit-${viewport.width}.png`, animations: "disabled" });
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(more).toBeFocused();
    await expect(page.locator(".app-dialog")).toHaveCount(0);
    await row.getByRole("button", { name: "Stock In for Ground Coffee", exact: true }).click();
    const stock = page.getByRole("dialog", { name: "Stock In", exact: true });
    await stock.getByLabel("Quantity", { exact: true }).fill("2");
    await chooseOption(page, stock.getByRole("combobox", { name: "Purchase unit", exact: true }), "kg — kilograms (× 1,000 g)");
    await stock.getByLabel("Actual total purchase cost (PHP)", { exact: true }).fill("1000");
    await expect(stock.getByRole("status", { name: "Stock receipt preview" })).toContainText("₱0.50 / g");
    await expect(stock.getByRole("status", { name: "Stock receipt preview" })).toContainText("4,000 g");
    await expect(stock.getByRole("button", { name: "Review Stock Receipt", exact: true })).toBeInViewport();
    expect(await stock.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-stock-in-${viewport.width}.png`, animations: "disabled" });
    await stock.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "History", exact: true }).click();
    const history = page.getByRole("region", { name: "Inventory movement history", exact: true });
    const toolbar = page.locator(".inventory-history-section .data-toolbar");
    const heading = toolbar.getByRole("heading", { name: "History", exact: true });
    await expect(heading).toBeVisible();
    if (viewport.width >= 1280) {
      const centerY = async (locator: typeof heading) => locator.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        return bounds.y + bounds.height / 2;
      });
      const headingY = await centerY(heading);
      for (const control of [toolbar.getByRole("searchbox"), toolbar.getByRole("combobox").first(), toolbar.getByRole("textbox", { name: "From Date", exact: true })]) {
        expect(Math.abs(await centerY(control) - headingY)).toBeLessThanOrEqual(2);
      }
    }
    await expect(history).toContainText("Sale Consumption");
    await expect(history.locator("thead th").last()).toHaveText("Actions");
    await expect(history).not.toContainText("Receipt #00000000");
    await expect(history).not.toContainText("DR-501");
    await expect(history.locator("details")).toHaveCount(0);
    const viewDetails = history.getByRole("button", { name: "View details for Ground Coffee", exact: true }).first();
    const originalHeight = await history.locator("tbody tr").first().evaluate(el => el.getBoundingClientRect().height);
    await viewDetails.hover();
    await expect(page.getByRole("tooltip")).toHaveText("View Details");
    await viewDetails.focus();
    await page.keyboard.press("Enter");
    const movement = page.getByRole("dialog", { name: "Stock Movement Details", exact: true });
    await expect(movement).toContainText("Balance Before");
    await expect(movement).toContainText("+1,000 g");
    await expect(movement).toContainText("DR-501");
    await expect(movement.getByText(uid(201), { exact: true })).not.toBeVisible();
    await movement.getByText("Advanced Details", { exact: true }).click();
    await expect(movement.getByText(uid(201), { exact: true })).toBeVisible();
    await expect(movement.getByRole("button", { name: "Close dialog", exact: true })).toBeInViewport();
    expect(await movement.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/movement-details-${viewport.width}.png`, animations: "disabled" });
    await movement.getByRole("button", { name: "Close dialog", exact: true }).click();
    await expect(viewDetails).toBeFocused();
    expect(await history.locator("tbody tr").first().evaluate(el => el.getBoundingClientRect().height)).toBe(originalHeight);
    for (const label of ["From Date", "To Date"]) {
      const input = page.getByRole("textbox", { name: label, exact: true });
      expect(await input.evaluate(el => {
        const input = el as HTMLInputElement, style = getComputedStyle(input);
        const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!;
        ctx.font = style.font;
        return ctx.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      })).toBe(true);
    }
    await page.getByRole("button", { name: "Open From Date calendar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "From Date calendar", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    await history.evaluate(el => { el.scrollLeft = 0; });
    if (viewport.width >= 1032) expect(await history.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/inventory/refined-history-${viewport.width}.png`, animations: "disabled" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("filters, item editing, confirmed stock posting and count revision remain intact", async ({ page }) => {
  const { calls, state } = await setup(page);
  await page.goto("/app/inventory");
  await chooseOption(page, page.getByRole("combobox", { name: "Stock status", exact: true }), "Low Stock");
  await expect(page.getByRole("region", { name: "Inventory items", exact: true }).locator("tbody tr")).toHaveCount(1);
  await chooseOption(page, page.getByRole("combobox", { name: "Stock status", exact: true }), "All statuses");
  const row = page.getByRole("row", { name: "Open Ground Coffee details" });
  await row.getByRole("button", { name: "More actions for Ground Coffee", exact: true }).click();
    await page.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Inventory Item", exact: true });
  await edit.getByRole("textbox", { name: "Notes (optional)", exact: true }).fill("Store sealed.");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toHaveCount(0);
  expect(calls[0]).toMatchObject({ action: "item", data: { id: uid(1), minimum_stock: "100", base_unit: "g", notes: "Store sealed." } });
  await row.getByRole("button", { name: "More actions for Ground Coffee", exact: true }).click();
  await page.getByRole("button", { name: "Count Stock for Ground Coffee", exact: true }).click();
  const count = page.getByRole("dialog", { name: "Count Stock", exact: true });
  await count.getByLabel("Actual physical quantity", { exact: true }).fill("1900");
  await count.getByLabel("Reason", { exact: true }).fill("Physical shelf count");
  await expect(count.getByLabel("Physical count comparison")).toContainText("-100 g");
  await count.getByRole("button", { name: "Review Count", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Confirm Stock Count?", exact: true });
  expect(calls.filter(call => call.action === "stock")).toHaveLength(0);
  state.fail = true;
  await confirm.getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Stock changed. Refresh and recount.");
  await expect(confirm).toBeVisible();
  state.fail = false;
  await confirm.getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(count).toHaveCount(0);
  const counts = calls.filter(call => call.action === "stock");
  expect(counts[0].data).toMatchObject({ kind: "count", quantity: "1900", expected_revision: 7, purchase_unit: "g" });
  expect(counts[1].data.operation_id).toBe(counts[0].data.operation_id);
  await row.getByRole("button", { name: "More actions for Ground Coffee", exact: true }).click();
    await page.getByRole("button", { name: "Adjust Stock for Ground Coffee", exact: true }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust Stock", exact: true });
  await adjust.getByLabel("Quantity to deduct", { exact: true }).fill("50");
  await expect(adjust.getByRole("status")).toContainText("-50 g");
  await adjust.getByRole("button", { name: "Review Adjustment", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(adjust).toHaveCount(0);
  expect(calls.at(-1)?.data).toMatchObject({ kind: "waste", quantity: "50", reason: "Wastage / spillage" });
  await expect(page.locator(".app-dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await chooseOption(page, page.getByRole("combobox", { name: "Inventory item", exact: true }), "Ground Coffee");
  await expect(page.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("Ground Coffee");
  await chooseOption(page, page.getByRole("combobox", { name: "Inventory item", exact: true }), "All items");
  await chooseOption(page, page.getByRole("combobox", { name: "Movement type", exact: true }), "Wastage");
  await expect(page.getByRole("region", { name: "Inventory movement history", exact: true }).locator("tbody tr")).toHaveCount(1);
  await expect(page.locator(".inventory-header-actions").getByRole("button", { name: "Return to Stock", exact: true })).toBeEnabled();
  await expect(page.locator(".inventory-history-section").getByRole("button", { name: "Return to Stock", exact: true })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Eligible refunded items" })).toHaveCount(0);
});

test("empty inventory keeps creation and optional initial stock available", async ({ page }) => {
  const { calls } = await setup(page, true);
  await page.goto("/app/inventory");
  await expect(page.getByRole("button", { name: "Stock In", exact: true })).toHaveCount(0);
  await expect(page.getByText("No inventory items yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add Item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Coffee Beans");
  await page.getByText("Initial Stock", { exact: true }).click();
  await page.getByLabel("Initial Quantity", { exact: true }).fill("1000");
  await page.getByLabel("Total Initial Stock Value (PHP)", { exact: true }).fill("600");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls[0].data.initial_stock).toMatchObject({ quantity: "1000", total_cost_cents: 60000 });
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return to Stock", exact: true })).toBeDisabled();
});

test("selected non-first item stays contextual through stock actions and refresh", async ({ page }) => {
  const { data, calls, state } = await setup(page);
  await page.goto("/app/inventory");
  await page.getByRole("searchbox", { name: "Search inventory items", exact: true }).fill("12 oz Cup");
  await page.getByRole("row", { name: "Open 12 oz Cup details", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "12 oz Cup", exact: true });
  await expect(detail).toContainText("20 pcs");
  await detail.getByRole("button", { name: "Close dialog", exact: true }).click();
  const row = page.getByRole("row", { name: "Open 12 oz Cup details", exact: true });
  await row.getByRole("button", { name: "Stock In for 12 oz Cup", exact: true }).click();
  const stock = page.getByRole("dialog", { name: "Stock In", exact: true });
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  await expect(stock.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("12 oz Cup (20 pcs on hand)");
  await stock.getByLabel("Quantity", { exact: true }).fill("10");
  await stock.getByLabel("Actual total purchase cost (PHP)", { exact: true }).fill("30");
  await stock.getByRole("button", { name: "Review Stock Receipt", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm Stock Receipt?", exact: true });
  let release!: () => void;
  state.beforeWrite = new Promise<void>(resolve => { release = resolve; });
  // The next read represents the server's authoritative result, not UI arithmetic.
  state.afterWrite = () => { data.items[1] = { ...data.items[1], quantity: "30", value_cents: 9000, revision: 2 }; };
  const confirm = confirmation.getByRole("button", { name: "Confirm & Post", exact: true });
  await confirm.click();
  const posting = confirmation.getByRole("button", { name: "Posting…", exact: true });
  await expect(posting).toBeDisabled();
  await posting.dispatchEvent("click");
  expect(calls.filter(call => call.action === "stock")).toHaveLength(1);
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toHaveCount(0);
  release();
  await expect(stock).toHaveCount(0);
  await expect(row).toContainText("30 pcs");
  await expect(page.locator(".app-dialog")).toHaveCount(0);
  expect(calls[0].data).toMatchObject({ ingredient_id: uid(2), kind: "receipt", quantity: "10", total_cost_cents: 3000, purchase_unit: "each" });
  state.beforeWrite = undefined; state.afterWrite = undefined;
  await row.getByRole("button", { name: "More actions for 12 oz Cup", exact: true }).click();
  await page.getByRole("button", { name: "Count Stock for 12 oz Cup", exact: true }).click();
  const count = page.getByRole("dialog", { name: "Count Stock", exact: true });
  await expect(count.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("12 oz Cup (30 pcs on hand)");
  await count.getByLabel("Actual physical quantity", { exact: true }).fill("30");
  await expect(count.getByText("Stock matches the system balance.", { exact: true })).toBeVisible();
  await count.getByLabel("Reason", { exact: true }).fill("Shelf count");
  await count.getByRole("button", { name: "Review Count", exact: true }).click();
  await expect(count.getByRole("alert")).toContainText("Counted quantity matches the system quantity");
  await count.getByLabel("Actual physical quantity", { exact: true }).fill("28");
  await count.getByRole("button", { name: "Review Count", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(count).toHaveCount(0);
  expect(calls.at(-1)?.data).toMatchObject({ ingredient_id: uid(2), kind: "count", expected_revision: 2, quantity: "28", purchase_unit: "each" });
  await row.getByRole("button", { name: "More actions for 12 oz Cup", exact: true }).click();
  await page.getByRole("button", { name: "Adjust Stock for 12 oz Cup", exact: true }).click();
  const adjust = page.getByRole("dialog", { name: "Adjust Stock", exact: true });
  await expect(adjust.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("12 oz Cup (30 pcs on hand)");
  await adjust.getByLabel("Quantity to deduct", { exact: true }).fill("1000");
  await adjust.getByRole("button", { name: "Review Adjustment", exact: true }).click();
  await expect(adjust.getByRole("alert")).toContainText("Cannot reduce stock below zero");
  await chooseOption(page, adjust.getByRole("combobox", { name: "Adjustment reason category", exact: true }), "Increase Stock (Correction)");
  await adjust.getByLabel("Quantity to add", { exact: true }).fill("3");
  await expect(adjust.getByRole("status")).toContainText("+3 pcs");
  await expect(adjust.getByRole("status")).toContainText("33 pcs");
  await adjust.getByRole("button", { name: "Cancel", exact: true }).click();
  await row.getByRole("button", { name: "More actions for 12 oz Cup", exact: true }).click();
  const actions = page.getByRole("dialog", { name: "More actions for 12 oz Cup", exact: true });
  await actions.getByRole("button", { name: "Edit inventory item 12 oz Cup", exact: true }).focus();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("dialog", { name: "Edit Inventory Item", exact: true });
  await expect(edit.getByLabel("Item name", { exact: true })).toHaveValue("12 oz Cup");
  await expect(edit.getByLabel("Low-stock threshold", { exact: true })).toHaveValue("20");
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".app-dialog")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search inventory items", exact: true })).toHaveValue("12 oz Cup");
  await expect(page.getByLabel("Current inventory overview")).toContainText("₱1,450.00");
  await page.getByRole("row", { name: "Open 12 oz Cup details", exact: true }).click();
  await detail.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await chooseOption(page, page.getByRole("combobox", { name: "Inventory item", exact: true }), "12 oz Cup");
  await expect(page.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("12 oz Cup");
});

test("row controls isolate pointer and keyboard actions, preserve inactive restrictions, and restore focus after filtering", async ({ page }) => {
  const { data, state } = await setup(page);
  data.items[3].active = false;
  await page.goto("/app/inventory");
  const inactive = page.getByRole("row", { name: "Open Brownie details", exact: true });
  await expect(inactive.getByRole("button", { name: "Stock In for Brownie", exact: true })).toBeDisabled();
  await expect(inactive.getByRole("button", { name: "Count Stock for Brownie", exact: true })).toHaveCount(0);
  await inactive.locator(".table-action-disabled").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await inactive.getByRole("button", { name: "More actions for Brownie", exact: true }).click();
  const inactiveActions = page.getByRole("dialog", { name: "More actions for Brownie", exact: true });
  await expect(inactiveActions.getByRole("button", { name: "Count Stock for Brownie", exact: true })).toBeDisabled();
  await expect(inactiveActions.getByRole("button", { name: "Adjust Stock for Brownie", exact: true })).toBeDisabled();
  await expect(inactiveActions.getByRole("button", { name: "Edit inventory item Brownie", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  const row = page.getByRole("row", { name: "Open Ground Coffee details", exact: true });
  const more = row.getByRole("button", { name: "More actions for Ground Coffee", exact: true });
  await more.focus();
  await page.keyboard.press("Space");
  const countAction = page.getByRole("dialog", { name: "More actions for Ground Coffee", exact: true }).getByRole("button", { name: "Count Stock for Ground Coffee", exact: true });
  await countAction.focus();
  await page.keyboard.press("Space");
  const count = page.getByRole("dialog", { name: "Count Stock", exact: true });
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  await expect(count.getByRole("combobox", { name: "Inventory item", exact: true })).toHaveText("Ground Coffee (2,000 g on hand)");
  await count.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(more).toBeFocused();
  const stockAction = row.getByRole("button", { name: "Stock In for Ground Coffee", exact: true });
  await stockAction.focus();
  await page.keyboard.press("Enter");
  const stock = page.getByRole("dialog", { name: "Stock In", exact: true });
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  await stock.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(stockAction).toBeFocused();
  const search = page.getByRole("searchbox", { name: "Search inventory items", exact: true });
  await search.fill("Ground Coffee");
  await more.hover();
  await expect(page.getByRole("tooltip")).toHaveText("More Actions");
  await more.click();
  const actions = page.getByRole("dialog", { name: "More actions for Ground Coffee", exact: true });
  await actions.click({ position: { x: 3, y: 3 } });
  await expect(page.getByRole("dialog", { name: "Ground Coffee", exact: true })).toHaveCount(0);
  await actions.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit Inventory Item", exact: true });
  await edit.getByLabel("Item name", { exact: true }).fill("Renamed coffee");
  state.afterWrite = () => { data.items[0] = { ...data.items[0], name: "Renamed coffee" }; };
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(row).toHaveCount(0);
  await expect(search).toHaveValue("Ground Coffee");
  await expect(page.getByRole("button", { name: "Stock Items", exact: true })).toBeFocused();
});

test("reference modules keep their shared table and dialog presentation", async ({ page }) => {
  await setup(page);
  for (const [name, url] of [["menu", "/app/menu"], ["sales", "/app/sales"], ["expenses", "/expenses"], ["dashboard", "/dashboard"]]) {
    await page.goto(url);
    await expect(page.locator("h1")).toBeVisible();
    await page.screenshot({ path: `.local/ui-review/inventory/reference-${name}.png`, animations: "disabled" });
  }
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.screenshot({ path: ".local/ui-review/inventory/reference-product-dialog.png", animations: "disabled" });
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await page.screenshot({ path: ".local/ui-review/inventory/reference-expense-dialog.png", animations: "disabled" });
});

test("history filters reset individually and movement details preserve paging", async ({ page }) => {
  const { data, requests } = await setup(page);
  const original = structuredClone(data.movements[0]);
  data.movements = Array.from({ length: 26 }, (_, index) => ({ ...original, id: uid(500 + index), reference: `DELIVERY-${index + 1}` }));
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "History", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search history", exact: true });
  const paging = page.getByRole("navigation", { name: "Inventory movement history pagination" });
  await search.fill("DELIVERY");
  await paging.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(paging.locator(".table-count")).toContainText("11–20 of 26");
  await page.getByRole("button", { name: "View details for Ground Coffee", exact: true }).first().click();
  const details = page.getByRole("dialog", { name: "Stock Movement Details", exact: true });
  await expect(details).toContainText("DELIVERY-11");
  await page.keyboard.press("Escape");
  await expect(paging.locator(".table-count")).toContainText("11–20 of 26");
  await expect(search).toHaveValue("DELIVERY");
  await chooseOption(page, page.getByRole("combobox", { name: "Inventory item", exact: true }), "12 oz Cup");
  await expect(paging.locator(".table-count")).toContainText("0–0 of 0");
  await chooseOption(page, page.getByRole("combobox", { name: "Inventory item", exact: true }), "All items");
  await expect(paging.locator(".table-count")).toContainText("1–10 of 26");
  await chooseOption(page, page.getByRole("combobox", { name: "Movement type", exact: true }), "Wastage");
  await expect(paging.locator(".table-count")).toContainText("0–0 of 0");
  await chooseOption(page, page.getByRole("combobox", { name: "Movement type", exact: true }), "All movements");
  await search.fill("");
  await expect(paging.locator(".table-count")).toContainText("1–10 of 26");
  await expect(page.getByRole("button", { name: /clear filters|reset filters|clear all filters/i })).toHaveCount(0);
  await page.getByRole("textbox", { name: "From Date", exact: true }).fill("Nov 1, 2026");
  await expect.poll(() => requests.at(-1)).toContain("from=2026-11-01&to=2026-11-07");
  const count = requests.length;
  await page.getByRole("textbox", { name: "From Date", exact: true }).fill("Nov 9, 2026");
  await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
  expect(requests).toHaveLength(count);
  expect(data.movements[0]).toEqual({ ...original, id: uid(500), reference: "DELIVERY-1" });
});

test("sale movements navigate to the existing authorized receipt viewer", async ({ page }) => {
  const { data } = await setup(page);
  data.movements[1] = { ...data.movements[1], source_id: uid(2), occurred_on: "2026-11-02", created_at: "2026-11-02T04:00:00Z" };
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByRole("button", { name: "View details for Ground Coffee", exact: true }).nth(1).click();
  const details = page.getByRole("dialog", { name: "Stock Movement Details", exact: true });
  const receiptLink = details.getByRole("link", { name: "View Receipt", exact: true });
  await expect(receiptLink).toHaveAttribute("href", `/app/sales?from=2026-11-02&to=2026-11-02#receipt-${uid(2)}`);
  await receiptLink.click();
  const receipt = page.getByRole("dialog", { name: "Sale receipt", exact: true });
  await expect(receipt).toContainText("Latte");
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  await receipt.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(receipt).toHaveCount(0);
  await expect(page).not.toHaveURL(/#receipt-/);
  await page.goto(`/app/sales?from=2026-11-02&to=2026-11-02#receipt-${uid(999)}`);
  await expect(page.getByText("This receipt is unavailable", { exact: false })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("linked receipts resolve beyond the visible page without changing table pagination", async ({ page }) => {
  await page.goto(`/app/sales?from=2026-11-02&to=2026-11-02&many#receipt-${uid(130)}`);
  const receipt = page.getByRole("dialog", { name: "Sale receipt", exact: true });
  await expect(receipt).toBeVisible();
  await receipt.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Sales history pagination" }).locator(".table-count")).toContainText("1–10 of 40");
});
