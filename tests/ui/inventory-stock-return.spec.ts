import { expect, test, type Page } from "@playwright/test";
import type { InventoryData } from "../../src/lib/inventory/domain";
import type { Sale } from "../../src/lib/sales/domain";
import { chooseOption } from "../helpers/select";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sale: Sale = {
  id: id(21), created_at: "2026-11-02T09:00:00Z", total_cents: 8000, total_cost_cents: 3000,
  method: "gcash", status: "refunded", payment_status: "refunded", tendered_cents: null,
  refund_reason: "Unopened item returned", refunded_at: "2026-11-02T09:30:00Z",
  items: [{ name: "Brownie", quantity: 1, unit_price_cents: 8000, line_total_cents: 8000 }],
};
async function setup(page: Page, status = "refunded") {
  const data: InventoryData = {
    items: [{ id: id(1), name: "Brownie", item_type: "finished_good", base_unit: "each", minimum_stock: "2",
      active: true, quantity: "10", value_cents: 30000, unit_cost_cents: "3000", revision: 1, has_movements: true, notes: "" }],
    movements: [], configs: [], returnable: [
      { id: id(301), sale_id: sale.id, ingredient_name: "Brownie", remaining_quantity: "1", base_unit: "each", receipt: "00000000" },
      // Receipt display prefixes can collide; only the full sale ID may establish context.
      { id: id(302), sale_id: id(22), ingredient_name: "Other receipt croissant", remaining_quantity: "1", base_unit: "each", receipt: "00000000" },
      { id: id(303), ingredient_name: "Legacy unscoped item", remaining_quantity: "1", base_unit: "each", receipt: "00000000" },
      { id: id(304), sale_id: sale.id, ingredient_name: "Already returned", remaining_quantity: "0", base_unit: "each", receipt: "00000000" },
    ],
  };
  await page.addInitScript(s => sessionStorage.setItem("fixture-sales", JSON.stringify([s])), { ...sale, status });
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  const state: { fail: boolean; hold?: Promise<void>; reads: number } = { fail: false, reads: 0 };
  await page.route("**/api/inventory*", async route => {
    if (route.request().method() === "GET") {
      state.reads++;
      return route.fulfill({ json: { data } });
    }
    calls.push(route.request().postDataJSON());
    await state.hold;
    if (state.fail) return route.fulfill({ status: 409, json: { error: "Stock return could not be posted. Retry." } });
    data.returnable = data.returnable.filter(entry => entry.id !== id(301));
    data.items[0].quantity = "11";
    data.items[0].value_cents = 33000;
    data.movements.push({ id: id(401), ingredient_id: id(1), name: "Brownie", base_unit: "each", kind: "return",
      quantity_delta: "1", value_delta_cents: 3000, previous_quantity: "10", resulting_quantity: "11",
      occurred_on: "2026-11-02", created_at: "2026-11-02T10:00:00Z", created_by: id(99), source_id: id(501), reason: "Unopened and reusable" });
    return route.fulfill({ json: { data: {} } });
  });
  return { data, calls, state };
}

const openReturn = async (page: Page) => {
  await page.getByRole("button", { name: "Return to Stock", exact: true }).click();
  const returned = page.getByRole("dialog", { name: "Return to Stock", exact: true });
  await expect(page.locator(".app-dialog")).toHaveCount(1);
  return returned;
};

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 },
  { width: 768, height: 1024 }, { width: 393, height: 852 },
]) test(`Inventory toolbar and stock return fit ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const { calls } = await setup(page);
  await page.goto("/app/inventory");
  const search = page.getByRole("searchbox", { name: "Search inventory items", exact: true });
  await search.fill("Brownie");
  const action = page.getByRole("button", { name: "Return to Stock", exact: true });
  await expect(page.locator(".inventory-header-actions").getByRole("button", { name: "Return to Stock", exact: true })).toBeVisible();
  await expect(page.locator(".inventory-header-actions")).toHaveCount(1);
  await page.screenshot({ path: `.local/ui-review/inventory-returns/toolbar-${viewport.width}.png`, animations: "disabled" });
  const returned = await openReturn(page);
  await expect(returned.getByRole("combobox", { name: "Finished good", exact: true })).toHaveText("Brownie");
  await expect(returned.getByRole("combobox", { name: "Refunded receipt", exact: true })).toContainText("00000021");
  await returned.getByLabel("Return quantity", { exact: true }).fill("1");
  await returned.getByLabel("Return reason", { exact: true }).fill("Unopened and reusable");
  await page.screenshot({ path: `.local/ui-review/inventory-returns/return-${viewport.width}.png`, animations: "disabled" });
  expect(await returned.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const review = returned.getByRole("button", { name: "Review Return", exact: true });
  expect((await review.boundingBox())!.y + (await review.boundingBox())!.height).toBeLessThan(viewport.height);
  await review.click();
  const confirm = page.getByRole("alertdialog", { name: "Return Finished Goods to Stock?", exact: true });
  await expect(confirm).toContainText("Brownie");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(returned.getByLabel("Return quantity", { exact: true })).toHaveValue("1");
  await returned.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(action).toBeFocused();
  await expect(search).toHaveValue("Brownie");
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(action).toBeVisible();
  await expect(page.locator(".inventory-history-section").getByRole("button", { name: "Return to Stock", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("receipt selection scopes finished goods and resets quantities without confusing duplicate display references", async ({ page }) => {
  const { data, calls } = await setup(page);
  data.returnable.push({ id: id(305), sale_id: sale.id, ingredient_name: "Packaged cookie", remaining_quantity: "2", base_unit: "each", receipt: "00000000" });
  await page.goto("/app/inventory");
  const returned = await openReturn(page);
  const item = returned.getByRole("combobox", { name: "Finished good", exact: true });
  await chooseOption(page, item, "Packaged cookie");
  await expect(returned).toContainText("2 pcs");
  await returned.getByLabel("Return quantity", { exact: true }).fill("2");
  const receipt = returned.getByRole("combobox", { name: "Refunded receipt", exact: true });
  await chooseOption(page, receipt, "#00000000 \u00b7 \u202600000022");
  await expect(item).toHaveText("Other receipt croissant");
  await expect(returned.getByLabel("Return quantity", { exact: true })).toHaveValue("");
  await item.click();
  await expect(page.getByRole("option")).toHaveText(["Other receipt croissant"]);
  await page.keyboard.press("Escape");
  expect(calls).toHaveLength(0);
});

test("return validation, failed retry, confirmation and stock refresh keep the existing operation", async ({ page }) => {
  const { data, calls, state } = await setup(page);
  data.returnable = [data.returnable[0]];
  await page.goto("/app/inventory");
  const returned = await openReturn(page);
  await returned.getByLabel("Return reason", { exact: true }).fill("Unopened and reusable");
  await returned.getByLabel("Return quantity", { exact: true }).fill("2");
  await returned.getByRole("button", { name: "Review Return", exact: true }).click();
  await expect(returned.getByRole("alert")).toContainText("exceeds");
  await returned.getByLabel("Return quantity", { exact: true }).fill("0.5");
  await returned.getByRole("button", { name: "Review Return", exact: true }).click();
  await expect(returned.getByRole("alert")).toContainText("whole number");
  expect(calls).toHaveLength(0);
  await returned.getByLabel("Return quantity", { exact: true }).fill("1");
  await returned.getByRole("button", { name: "Review Return", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "Return Finished Goods to Stock?", exact: true });
  state.fail = true;
  await confirm.getByRole("button", { name: "Confirm Return", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("could not be posted");
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toHaveCount(0);
  await expect(confirm).toBeVisible();
  let finish!: () => void;
  state.hold = new Promise<void>(resolve => { finish = resolve; });
  state.fail = false;
  await confirm.getByRole("button", { name: "Confirm Return", exact: true }).click();
  const pending = confirm.getByRole("button", { name: "Posting\u2026", exact: true });
  await expect(pending).toBeDisabled();
  await pending.evaluate(button => (button as HTMLButtonElement).click());
  await expect.poll(() => calls.length).toBe(2);
  finish();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText("Finished goods returned");
  expect(calls[1]).toEqual(calls[0]);
  expect(calls[0]).toMatchObject({ action: "return", data: { consumption_id: id(301), quantity: "1", reason: "Unopened and reusable" } });
  await expect(page.getByRole("button", { name: "Return to Stock", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stock Items", exact: true })).toBeFocused();
  const row = page.getByRole("row", { name: "Open Brownie details", exact: true });
  await expect(row).toContainText("11 pcs");
  await expect(row).toContainText("\u20b1330.00");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("region", { name: "Inventory movement history", exact: true })).toContainText("Finished-Good Return");
  expect(data.movements).toHaveLength(1);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "View receipt 00000000", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Sale receipt", exact: true });
  await expect(receipt).toContainText("\u20b180.00");
  await expect(receipt).toContainText("refunded");
  await expect(receipt.getByRole("button", { name: /Return to Stock|Return Finished Goods/ })).toHaveCount(0);
});

for (const status of ["refunded", "completed"]) test(`Sales ${status} receipts keep payment operations without stock actions`, async ({ page }) => {
  const { state } = await setup(page, status);
  await page.goto("/app/sales");
  await page.getByRole("button", { name: "View receipt 00000000", exact: true }).click();
  const receipt = page.getByRole("dialog", { name: "Sale receipt", exact: true });
  await expect(receipt.getByRole("button", { name: /Return to Stock|Return Finished Goods/ })).toHaveCount(0);
  expect(state.reads).toBe(0);
  if (status === "completed") await expect(receipt.getByRole("button", { name: "Refund sale", exact: true })).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Print receipt", exact: true })).toBeVisible();
});

test("empty eligibility disables toolbar returns; denied Inventory access cannot open the workflow", async ({ page }) => {
  const { data } = await setup(page);
  data.returnable = [];
  await page.goto("/app/inventory");
  await expect(page.getByRole("button", { name: "Return to Stock", exact: true })).toBeDisabled();
  await page.route("**/api/inventory*", route => route.fulfill({ status: 403, json: { error: "Owner access required." } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Owner access required");
  await expect(page.getByRole("button", { name: "Return to Stock", exact: true })).toHaveCount(0);
});
