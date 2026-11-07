import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";
import type { InventoryData, InventoryItem } from "../../src/lib/inventory/domain";

const id = "00000000-0000-4000-8000-000000009001";
const baseItem: InventoryItem = {
  id,
  name: "Ground Coffee",
  item_type: "ingredient",
  base_unit: "g",
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

async function inventoryApi(page: Page, empty = false) {
  const data: InventoryData = {
    items: empty
      ? []
      : [
          { ...baseItem },
          {
            id: "00000000-0000-4000-8000-000000009002",
            name: "16 oz Cold Cup",
            item_type: "supply",
            base_unit: "each",
            minimum_stock: "50",
            notes: "Clear PET cup",
            active: true,
            quantity: "40",
            value_cents: 12000,
            unit_cost_cents: "300",
            revision: 1,
            has_movements: true,
            unit_locked: true,
          },
          {
            id: "00000000-0000-4000-8000-000000009003",
            name: "Caramel Drizzle",
            item_type: "ingredient",
            base_unit: "ml",
            minimum_stock: "100",
            notes: "",
            active: true,
            quantity: "1000",
            value_cents: 300,
            unit_cost_cents: "0.3",
            revision: 1,
            has_movements: true,
            unit_locked: true,
          },
        ],
    movements: empty
      ? []
      : [
          {
            id: "00000000-0000-4000-8000-000000009101",
            ingredient_id: id,
            name: "Ground Coffee",
            base_unit: "g",
            kind: "receipt",
            quantity_delta: "2000",
            value_delta_cents: 100000,
            previous_quantity: "0",
            resulting_quantity: "2000",
            occurred_on: "2026-11-07",
            created_at: "2026-11-07T02:15:00Z",
            created_by: id,
            source_id: "00000000-0000-4000-8000-000000009201",
            reason: "Stock received",
            supplier: "Davao Roasters",
            reference: "DR-104",
            purchase_unit: "kg",
            entered_quantity: "2",
          },
          {
            id: "00000000-0000-4000-8000-000000009102",
            ingredient_id: "00000000-0000-4000-8000-000000009002",
            name: "16 oz Cold Cup",
            base_unit: "each",
            kind: "waste",
            quantity_delta: "-10",
            value_delta_cents: -3000,
            previous_quantity: "50",
            resulting_quantity: "40",
            occurred_on: "2026-11-07",
            created_at: "2026-11-07T03:00:00Z",
            created_by: id,
            source_id: "00000000-0000-4000-8000-000000009202",
            reason: "Damaged supplies",
          },
        ],
    configs: [],
    returnable: [],
  };
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  await page.route("**/api/inventory*", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data } });
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === "item") {
      const idx = data.items.findIndex(entry => entry.id === body.data.id);
      if (idx >= 0) {
        data.items[idx] = { ...data.items[idx], ...body.data };
      } else {
        data.items.push({
          ...baseItem,
          ...body.data,
          quantity: "0",
          value_cents: 0,
          unit_cost_cents: null,
          revision: 0,
          has_movements: false,
          unit_locked: false,
        });
      }
    } else if (body.action === "stock") {
      const target = data.items.find(entry => entry.id === body.data.ingredient_id);
      if (target) {
        const mult = body.data.purchase_unit === "kg" || body.data.purchase_unit === "L" ? 1000 : 1;
        const entered = Number(body.data.quantity) * mult;
        const delta =
          body.data.kind === "waste"
            ? -entered
            : body.data.kind === "count"
              ? entered - Number(target.quantity)
              : entered;
        const nextQty = Number(target.quantity) + delta;
        target.quantity = String(nextQty);
        if (typeof body.data.total_cost_cents === "number") {
          const nextValue =
            body.data.kind === "count"
              ? body.data.total_cost_cents
              : (target.value_cents ?? 0) + body.data.total_cost_cents;
          target.value_cents = nextValue;
          if (nextQty > 0) target.unit_cost_cents = String(nextValue / nextQty);
        }
        target.revision += 1;
        target.has_movements = true;
        target.unit_locked = true;
        data.movements.unshift({
          id: crypto.randomUUID(),
          ingredient_id: target.id,
          name: target.name,
          base_unit: target.base_unit,
          kind: String(body.data.kind),
          quantity_delta: String(delta),
          value_delta_cents:
            typeof body.data.total_cost_cents === "number" ? body.data.total_cost_cents : -500,
          previous_quantity: String(nextQty - delta),
          resulting_quantity: String(nextQty),
          occurred_on: String(body.data.occurred_on),
          created_at: "2026-11-07T04:00:00Z",
          created_by: id,
          source_id: String(body.data.operation_id),
          reason: String(body.data.reason),
          supplier: String(body.data.supplier ?? ""),
          reference: String(body.data.reference ?? ""),
          purchase_unit: String(body.data.purchase_unit),
          entered_quantity: String(body.data.quantity),
        });
      }
    }
    return route.fulfill({ json: { data: { id: body.data.operation_id ?? body.data.id } } });
  });
  return { calls, data };
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1032, height: 1376 },
  { width: 768, height: 1024 },
  { width: 393, height: 852 },
]) {
  test(`owner Inventory is usable and unclipped at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await inventoryApi(page);
    await page.goto("/app/inventory");
    await expect(page.getByRole("heading", { name: "Inventory", exact: true })).toBeVisible();
    await expect(page.getByLabel("Current inventory overview")).toContainText("₱1,123.00");
    const itemsRegion = page.getByRole("region", { name: "Inventory items", exact: true });
    await expect(itemsRegion).toContainText("2,000 g");
    await expect(itemsRegion).toContainText("₱0.50");
    await expect(itemsRegion).toContainText("₱0.00");
    await expect(itemsRegion).toContainText("In Stock");
    await expect(itemsRegion).toContainText("Low Stock");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Ensure action triggers are fully inside viewport (no horizontal clipping on desktop/tablet)
    const actionsBtn = page.getByRole("button", { name: "Stock actions for Ground Coffee", exact: true });
    await expect(actionsBtn).toBeVisible();
    const box = await actionsBtn.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    if (viewport.width >= 768) {
      const editBtn = page.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true });
      await expect(editBtn).toBeVisible();
      const editBox = await editBtn.boundingBox();
      expect(editBox!.x + editBox!.width).toBeLessThanOrEqual(viewport.width);
    }

    await page.screenshot({
      path: `.local/ui-review/inventory/items-${viewport.width}.png`,
      animations: "disabled",
    });

    await page.getByRole("button", { name: "Receive Stock", exact: true }).click();
    await expect(page.getByRole("region", { name: "Recent stock receipts", exact: true })).toContainText(
      "Davao Roasters",
    );

    await page.getByRole("button", { name: "Inventory History", exact: true }).click();
    const historyRegion = page.getByRole("region", { name: "Inventory movement history", exact: true });
    await expect(historyRegion).toContainText("Stock Received");
    await expect(historyRegion).toContainText("Wastage");
    await page.getByRole("button", { name: "Open From Date calendar", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "From Date calendar", exact: true })).toBeInViewport();
  });
}

test("first-time setup guide, item creation/editing, opening stock, receive stock, count, adjustment, and history filters", async ({
  page,
}) => {
  const { calls } = await inventoryApi(page, true);
  await page.goto("/app/inventory");

  // 1-2. First-time empty state & Setup Guide
  await expect(page.getByRole("heading", { name: "Start Managing Your Inventory", exact: true })).toBeVisible();
  const setupSection = page.getByRole("region", { name: "Inventory Setup", exact: true });
  await expect(setupSection).toContainText("Not Started");
  await setupSection.locator(".inventory-setup-toggle").click();
  await expect(setupSection).toContainText("Create Inventory Items");
  await expect(setupSection).toContainText("Activate Inventory Tracking");

  // Dismiss and reopen setup guide via header action
  await page.getByRole("button", { name: "Dismiss Inventory Setup guide", exact: true }).click();
  await expect(setupSection).toHaveCount(0);
  await page.getByRole("button", { name: "Inventory Setup", exact: true }).click();
  await expect(setupSection).toBeVisible();

  // How Inventory Works dialog
  await page.getByRole("button", { name: "How Inventory Works", exact: true }).click();
  const helpDialog = page.getByRole("dialog", { name: "How Inventory Works", exact: true });
  await expect(helpDialog).toContainText("Opening Stock vs Receive Stock");
  await helpDialog.getByRole("button", { name: "Done", exact: true }).click();

  // Collapse setup guide so contextual next-step banner guides next step
  await setupSection.locator(".inventory-setup-toggle").click();

  // 3. Create Inventory Item
  await page.getByRole("button", { name: "Add Inventory Item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Ground Coffee");
  await page.getByLabel("Low-stock threshold", { exact: true }).fill("250");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inventory items", exact: true })).toContainText("Ground Coffee");
  await expect(page.getByRole("region", { name: "Inventory items", exact: true })).toContainText("Out of Stock");
  await expect(page.locator(".inventory-context-banner")).toContainText(
    "Record available stock before activating product recipes",
  );

  // 4. Edit Inventory Item
  await page.getByRole("button", { name: "Edit inventory item Ground Coffee", exact: true }).click();
  await page.getByLabel("Notes (optional)", { exact: true }).fill("Medium-dark espresso grind");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Inventory items", exact: true })).toContainText(
    "Medium-dark espresso grind",
  );

  // 5. Opening Stock (distinct from Receive Stock)
  await page.getByRole("button", { name: "Stock actions for Ground Coffee", exact: true }).click();
  await page.locator(".inventory-actions-menu").getByRole("button", { name: /Set Opening Stock/ }).click();
  const openingDialog = page.getByRole("dialog", { name: "Set Opening Stock", exact: true });
  await expect(openingDialog).not.toContainText("count is rejected");
  await openingDialog.getByLabel("Quantity", { exact: true }).fill("1");
  await chooseOption(page, openingDialog.getByRole("combobox", { name: "Purchase unit", exact: true }), "kg — kilograms (× 1,000 g)");
  await expect(openingDialog.getByRole("status")).toContainText("1,000 g");
  await openingDialog.getByLabel("Actual total purchase cost (PHP)", { exact: true }).fill("500");
  await openingDialog.getByRole("button", { name: "Review Opening Stock", exact: true }).click();
  const confirmOpening = page.getByRole("alertdialog", { name: "Confirm Opening Stock?", exact: true });
  await expect(confirmOpening).toContainText("1 kg → 1,000 g");
  await expect(confirmOpening).toContainText("₱0.50 per g");
  expect(calls.filter(call => call.action === "stock")).toHaveLength(0);
  await confirmOpening.getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(confirmOpening).toHaveCount(0);
  expect(calls.find(call => call.action === "stock")?.data).toMatchObject({
    kind: "opening",
    quantity: "1",
    purchase_unit: "kg",
    total_cost_cents: 50000,
  });

  // 6. Receive Stock (opening stock no longer offered for Ground Coffee)
  await page.getByRole("button", { name: "Stock actions for Ground Coffee", exact: true }).click();
  await expect(page.locator(".inventory-actions-menu").getByRole("button", { name: /Set Opening Stock/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Inventory views" })
    .getByRole("button", { name: "Receive Stock", exact: true })
    .click();
  await page.locator(".inventory-toolbar").getByRole("button", { name: "Receive Stock", exact: true }).click();
  const receiveDialog = page.getByRole("dialog", { name: "Receive Stock", exact: true });
  await expect(receiveDialog).not.toContainText("physical count");
  await receiveDialog.getByLabel("Quantity", { exact: true }).fill("2");
  await chooseOption(page, receiveDialog.getByRole("combobox", { name: "Purchase unit", exact: true }), "kg — kilograms (× 1,000 g)");
  await receiveDialog.getByLabel("Actual total purchase cost (PHP)", { exact: true }).fill("1000");
  await receiveDialog.getByLabel("Supplier (optional)", { exact: true }).fill("Local Coffee Supply");
  await receiveDialog.getByRole("button", { name: "Review Stock Receipt", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();
  await expect(page.getByRole("region", { name: "Recent stock receipts", exact: true })).toContainText(
    "Local Coffee Supply",
  );

  // 7 & 8. Physical Stock Count and Stock Adjustment
  await page
    .getByRole("navigation", { name: "Inventory views" })
    .getByRole("button", { name: "Stock Items", exact: true })
    .click();
  await page.getByRole("button", { name: "Stock actions for Ground Coffee", exact: true }).click();
  await page.getByRole("button", { name: /Count Stock/ }).click();
  const countDialog = page.getByRole("dialog", { name: "Count Stock", exact: true });
  await countDialog.getByLabel("Actual physical quantity", { exact: true }).fill("2950");
  await expect(countDialog.getByLabel("Physical count comparison")).toContainText("-50 g");
  await countDialog.getByLabel("Reason", { exact: true }).fill("Routine evening shelf count");
  await countDialog.getByRole("button", { name: "Review Count", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();

  await page.getByRole("button", { name: "Stock actions for Ground Coffee", exact: true }).click();
  await page.getByRole("button", { name: /Adjust Stock/ }).click();
  const adjustDialog = page.getByRole("dialog", { name: "Adjust Stock", exact: true });
  await adjustDialog.getByLabel("Quantity to deduct", { exact: true }).fill("30");
  await expect(adjustDialog.getByRole("status")).toContainText("-30 g");
  await adjustDialog.getByRole("button", { name: "Review Adjustment", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm & Post", exact: true }).click();

  // 9. Inventory History filters
  await page
    .getByRole("navigation", { name: "Inventory views" })
    .getByRole("button", { name: "Inventory History", exact: true })
    .click();
  const historyRegion = page.getByRole("region", { name: "Inventory movement history", exact: true });
  await expect(historyRegion.locator("tbody tr")).toHaveCount(4);
  await chooseOption(page, page.getByRole("combobox", { name: "Movement type", exact: true }), "Wastage");
  await expect(historyRegion.locator("tbody tr")).toHaveCount(1);
  await expect(historyRegion).toContainText("Wastage / spillage");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(historyRegion.locator("tbody tr")).toHaveCount(4);
});
