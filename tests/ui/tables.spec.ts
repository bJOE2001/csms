import { expect, test, type Page } from "@playwright/test";
import type { Expense, Sale } from "../../src/lib/sales/domain";

const uid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
const categories = [{ id: uid(2), name: "Coffee" }, { id: uid(3), name: "Seasonal refreshments and freshly baked treats ".repeat(2).trim() }];
const products = [
  { id: uid(10), name: "Café Latte", description: "Espresso with steamed milk.", category_id: uid(2), price_cents: 12000, cost_cents: 4000, active: true,
    sizes: [
      { id: uid(11), label: "12 oz", price_cents: 12000, cost_cents: 4000, active: true, is_default: true },
      { id: uid(12), label: "16 oz", price_cents: 14500, cost_cents: 5000, active: true, is_default: false },
      { id: uid(13), label: "22 oz", price_cents: 17000, cost_cents: 6000, active: false, is_default: false },
    ] },
  { id: uid(20), name: "Seasonal coffee with vanilla, oat milk, and a very long product name ".repeat(2).slice(0, 120),
    description: "A carefully prepared seasonal drink with detailed ingredients and serving notes. ".repeat(5), category_id: uid(3), price_cents: 100000000, cost_cents: null, active: false,
    sizes: [{ id: uid(21), label: "Large specialty serving with a long custom size label", price_cents: 100000000, cost_cents: null, active: true, is_default: true }] },
  { id: uid(30), name: "Brownie", price_cents: 0, cost_cents: 0, active: true },
];
const expenses: Expense[] = [
  { id: uid(50), spent_on: "2026-11-02", description: "Rent and utilities ".repeat(10).trim(), amount_cents: 100000000, voided: false },
  { id: uid(51), spent_on: "2026-11-02", description: "Electricity", amount_cents: 125000, voided: true },
];
const sales: Sale[] = ["completed", "refunded", "cancelled"].map((status, i) => ({
  id: uid(60 + i), created_at: "2026-11-02T04:00:00Z", total_cents: i ? 14500 : 100000000,
  total_cost_cents: i === 1 ? null : 5000, method: i === 1 ? "gcash" : "cash", status: status as Sale["status"],
  payment_status: "confirmed", tendered_cents: i ? 20000 : 100000000, refund_reason: i === 1 ? "Returned payment" : null,
  items: [{ name: "Café Latte", size_label: "16 oz", quantity: 1, unit_price_cents: i ? 14500 : 100000000, line_total_cents: i ? 14500 : 100000000 }],
}));
const screens = [
  { path: "/app/menu", caption: "Menu products", heading: "Menu Management", search: "Search product name", rows: 3 },
  { path: "/libraries", caption: "Product categories", heading: "Libraries", search: "Search category name", rows: 2 },
  { path: "/expenses", caption: "Expense records", heading: "Expenses Management", search: "Search expenses", rows: 2 },
  { path: "/app/sales", caption: "Sales history", heading: "Sales", search: "Search receipt or payment method", rows: 3 },
];
async function seed(page: Page, empty = false, founder = true) {
  const writes: unknown[] = [];
  await page.addInitScript(({ expenses, sales, empty }) => {
    sessionStorage.setItem("fixture-expenses", JSON.stringify(empty ? [] : expenses));
    sessionStorage.setItem("fixture-sales", JSON.stringify(empty ? [] : sales));
  }, { expenses, sales, empty });
  await page.route("**/api/pos", route => {
    if (route.request().method() !== "GET") {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, json: { error: "Unexpected mutation in layout test" } });
    }
    return route.fulfill({ json: { shop: { id: uid(1), name: "Common Ground Coffee" }, user_id: uid(1), founder,
      products: empty ? [] : products, categories: empty ? [] : categories } });
  });
  return writes;
}

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 },
  { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
]) {
  test(`tables keep alignment, compact actions and contained overflow at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await seed(page);
    for (const screen of screens) {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const region = page.getByRole("region", { name: screen.caption, exact: true });
      await expect(region.locator("tbody tr")).toHaveCount(screen.rows);
      const geometry = await region.evaluate(element => {
        const box = element.getBoundingClientRect();
        const header = [...element.querySelectorAll<HTMLTableCellElement>("thead th")];
        const cells = [...element.querySelectorAll<HTMLTableCellElement>("tbody tr:first-child td")];
        const actions = cells.find(cell => cell.dataset.label === "Actions")!;
        return {
          pageWidth: document.documentElement.scrollWidth, regionRight: box.right, client: element.clientWidth, scroll: element.scrollWidth,
          columns: header.map((head, i) => ({ x: head.getBoundingClientRect().x, width: head.getBoundingClientRect().width, cellX: cells[i].getBoundingClientRect().x, cellWidth: cells[i].getBoundingClientRect().width })),
          actionWidth: actions.getBoundingClientRect().width,
          actionRight: actions.getBoundingClientRect().right,
          lastButtonRight: actions.querySelector("button:last-of-type")?.getBoundingClientRect().right,
          buttons: [...element.querySelectorAll<HTMLButtonElement>(".table-action-button")].map(button => ({ label: button.getAttribute("aria-label"), width: button.offsetWidth, height: button.offsetHeight, text: button.innerText.trim(), icon: button.querySelector("svg")?.getBoundingClientRect().width })),
        };
      });
      expect(geometry.pageWidth).toBe(viewport.width);
      expect(geometry.regionRight).toBeLessThanOrEqual(viewport.width);
      if (viewport.width >= 768) {
        for (const column of geometry.columns) {
          expect(Math.abs(column.x - column.cellX)).toBeLessThan(1);
          expect(Math.abs(column.width - column.cellWidth)).toBeLessThan(1);
        }
        const actionButtons = region.locator("tbody tr:first-child .table-actions > button");
        const actionCount = await actionButtons.count();
        const actionContentWidth = await actionButtons.evaluateAll(buttons => buttons.reduce((sum, button) => sum + button.getBoundingClientRect().width, 0));
        const actionSize = viewport.width >= 1280 ? 40 : 44;
        expect(geometry.actionWidth).toBeLessThanOrEqual(Math.max(128, Math.max(actionContentWidth, actionCount * actionSize) + Math.max(0, actionCount - 1) * 8 + 25));
        const last = region.locator("tbody tr:first-child .table-action-button").last();
        const bounds = (await last.boundingBox())!;
        expect(Math.abs(geometry.actionRight - bounds.x - bounds.width - 12)).toBeLessThan(1);
        for (const numeric of await region.locator("td.numeric").all()) {
          await expect(numeric).toHaveCSS("text-align", "right");
          await expect(numeric).toHaveCSS("font-variant-numeric", "tabular-nums");
        }
      } else {
        expect(geometry.scroll).toBe(geometry.client);
        const firstRow = region.locator("tbody tr").first();
        await expect(firstRow).toHaveCSS("display", "grid");
        const primary = firstRow.locator(".table-cell-primary");
        const actions = firstRow.locator(".table-cell-actions");
        expect((await actions.boundingBox())!.y).toBeGreaterThan((await primary.boundingBox())!.y);
      }
      for (const button of geometry.buttons) {
        expect(button.label).toBeTruthy();
        expect(button.text).toBe("");
        expect(button.width).toBe(viewport.width >= 1280 ? 40 : 44);
        expect(button.height).toBe(button.width);
        expect(button.icon).toBe(18);
      }
      if (screen.path === "/app/menu") {
        await expect(region).toContainText("22 oz · Unavailable");
        await expect(region).toContainText("Cost not recorded");
        await expect(region).toContainText("Uncategorized");
        await expect(region).toContainText("₱1,000,000.00");
      }
      if (screen.path === "/app/sales") await expect(region.locator(".sales-status")).toHaveText(["completed", "refunded", "cancelled"]);
      await page.screenshot({ path: info.outputPath(`${screen.path.replaceAll("/", "-")}-${viewport.width}.png`), fullPage: true });
      await page.getByRole("searchbox", { name: screen.search }).fill("no matching records whatsoever");
      await expect(region.locator("tbody tr")).toHaveCount(0);
      await expect(region).toContainText("No matching records");
      await region.getByRole("button", { name: "Clear search" }).click();
      await expect(region.locator("tbody tr")).toHaveCount(screen.rows);
    }
  });
}

test("table action tooltips support hover, keyboard, dialogs and safe cancellation", async ({ page }) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  const writes = await seed(page);
  for (const scenario of [
    { path: "/app/menu", label: "Edit Café Latte", tooltip: "Edit product", dialog: "Edit product", field: "Product name", value: "Café Latte" },
    { path: "/libraries", label: "Edit category Coffee", tooltip: "Edit category", dialog: "Edit category", field: "Category name", value: "Coffee" },
    { path: "/expenses", label: "Edit expense Electricity", tooltip: "Edit expense", dialog: "Edit expense", field: "Description", value: "Electricity" },
    { path: "/app/sales", label: "View receipt 00000060", tooltip: "View receipt", dialog: "Sale receipt" },
  ]) {
    // Electricity must be editable in this scenario; the layout case also checks voided rows.
    if (scenario.path === "/expenses") await page.addInitScript(() => sessionStorage.setItem("fixture-expenses", JSON.stringify([{ id: "00000051-0000-4000-8000-000000000001", spent_on: "2026-11-02", description: "Electricity", amount_cents: 125000, voided: false }])));
    await page.goto(scenario.path);
    const button = page.getByRole("button", { name: scenario.label, exact: true });
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText(scenario.tooltip);
    expect(await page.getByRole("tooltip").evaluate(element => !!element.closest(".table-scroll"))).toBe(false);
    await page.mouse.move(0, 0);
    await button.focus();
    await expect(page.getByRole("tooltip")).toHaveText(scenario.tooltip);
    await expect(button).toHaveCSS("outline-style", "solid");
    await expect(button).toHaveCSS("box-shadow", "none");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: scenario.dialog, exact: true });
    await expect(dialog).toBeVisible();
    if (scenario.field) await expect(dialog.getByLabel(scenario.field, { exact: true })).toHaveValue(scenario.value!);
    if (scenario.path === "/app/sales") await expect(dialog).toContainText("Size: 16 oz");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
  }
  for (const scenario of [
    { path: "/app/menu", label: "Delete product Café Latte", title: "Delete Café Latte?" },
    { path: "/libraries", label: "Delete category Coffee", title: "Delete Coffee?" },
    { path: "/expenses", label: "Delete expense Electricity", title: "Delete this expense?" },
  ]) {
    await page.goto(scenario.path);
    await page.getByRole("button", { name: scenario.label, exact: true }).click();
    const confirmation = page.getByRole("alertdialog", { name: scenario.title });
    await expect(confirmation).toBeVisible();
    if (scenario.path === "/libraries") {
      await expect(confirmation).toContainText("Products use this category");
      await expect(confirmation.getByRole("button", { name: "Delete category", exact: true })).toHaveCount(0);
      await confirmation.getByRole("button", { name: "Close", exact: true }).click();
    } else await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  expect(writes).toEqual([]);
});

test("empty tables, view-only permissions and disabled icon tooltips stay accessible", async ({ page }) => {
  await seed(page, true, false);
  for (const screen of screens) {
    await page.goto(screen.path);
    const region = page.getByRole("region", { name: screen.caption, exact: true });
    await expect(region.locator("tbody tr")).toHaveCount(0);
    await expect(page.locator(".table-count")).toContainText("0–0 of 0");
    await expect(region.locator(".table-action-button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/?controls");
  await expect(page.getByRole("button", { name: "Unavailable edit", exact: true })).toBeDisabled();
  await page.locator(".table-action-disabled").focus();
  await expect(page.getByRole("tooltip")).toHaveText("Editing is unavailable");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
