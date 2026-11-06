import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { chooseOption } from "../helpers/select";
import type { Category, Product } from "../../src/lib/menu/domain";
import type { Expense, Sale } from "../../src/lib/sales/domain";

const uid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
const screens = [
  { path: "/app/menu", caption: "Menu products", query: "Coffee", matches: 23 },
  { path: "/libraries", caption: "Product categories", query: "Coffee", matches: 23 },
  { path: "/app/sales", caption: "Sales history", query: "gcash", matches: 30 },
  { path: "/expenses", caption: "Expense records", query: "Coffee", matches: 23 },
];

async function seed(page: Page, count = 53) {
  const categories: Category[] = Array.from({ length: count }, (_, i) => ({
    id: uid(i + 100), name: `${i < 23 ? "Coffee" : "Tea"} category ${String(i + 1).padStart(2, "0")}`,
  }));
  const products: Product[] = Array.from({ length: count }, (_, i) => ({
    id: uid(i + 200), name: `${i < 23 ? "Coffee" : "Tea"} product ${String(i + 1).padStart(2, "0")}`,
    price_cents: 14500, cost_cents: 5000, active: i < 23,
    category_id: categories[0].id,
  }));
  const expenses: Expense[] = Array.from({ length: count }, (_, i) => ({
    id: uid(i + 300), description: `${i < 23 ? "Coffee" : "Tea"} expense ${String(i + 1).padStart(2, "0")}`,
    spent_on: i === count - 1 ? "2026-11-01" : "2026-11-02", amount_cents: 2000, voided: false,
  }));
  const sales: Sale[] = Array.from({ length: count }, (_, i) => ({
    id: uid(i + 400), created_at: i === count - 1 ? "2026-11-01T04:00:00Z" : "2026-11-02T04:00:00Z",
    total_cents: 14500, total_cost_cents: 5000, method: i < 23 ? "cash" : "gcash",
    status: "completed", payment_status: "confirmed", tendered_cents: 20000, refund_reason: null,
    items: [{ name: "Latte", quantity: 1, unit_price_cents: 14500, line_total_cents: 14500 }],
  }));
  await page.addInitScript(({ expenses, sales }) => {
    if (!sessionStorage.getItem("fixture-expenses")) sessionStorage.setItem("fixture-expenses", JSON.stringify(expenses));
    sessionStorage.setItem("fixture-sales", JSON.stringify(sales));
  }, { expenses, sales });
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: {
      shop: { id: uid(1), name: "Common Ground Coffee" }, founder: true,
      products: [...products].sort((a, b) => a.name.localeCompare(b.name)),
      categories: [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    } });
    const body = route.request().postDataJSON();
    if (body.action === "category") {
      const existing = categories.find(category => category.id === body.data.id);
      if (existing) Object.assign(existing, body.data);
      else categories.push(body.data);
    } else if (body.action === "delete_category") {
      categories.splice(categories.findIndex(category => category.id === body.data.id), 1);
    } else if (body.action === "product") {
      const existing = products.find(product => product.id === body.data.id);
      if (existing) Object.assign(existing, body.data);
      else products.push(body.data);
    } else if (body.action === "archive_product") {
      products.splice(products.findIndex(product => product.id === body.data.id), 1);
    } else {
      const existing = expenses.find(expense => expense.id === body.data.id);
      if (body.action === "expense" && !existing) expenses.unshift({ ...body.data, voided: false });
      if (body.action === "update_expense" && existing) Object.assign(existing, body.data);
      if (body.action === "void_expense" && existing) existing.voided = true;
      expenses.sort((a, b) => b.spent_on.localeCompare(a.spent_on));
      await page.evaluate(value => sessionStorage.setItem("fixture-expenses", JSON.stringify(value)), expenses);
    }
    await route.fulfill({ json: { data: body.data } });
  });
}

const period = "?from=2026-11-01&to=2026-11-02";
function pagination(page: Page, caption: string) {
  return page.getByRole("navigation", { name: `${caption} pagination`, exact: true });
}

test("all management tables share paging, page sizes, matching counts and search resets", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  for (const screen of screens) {
    await page.goto(screen.path + period);
    const rows = page.getByRole("region", { name: screen.caption, exact: true }).locator("tbody tr");
    const nav = pagination(page, screen.caption);
    await expect(rows).toHaveCount(10);
    await expect(nav.locator(".table-count")).toContainText("1–10 of 53");
    await expect(nav.getByRole("button", { name: "First page", exact: true })).toBeDisabled();
    await expect(nav.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
    await nav.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(nav.locator(".table-count")).toContainText("11–20 of 53");
    await nav.getByRole("button", { name: "Last page", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(nav.locator(".table-count")).toContainText("51–53 of 53");
    await expect(nav.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
    await nav.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(nav.locator(".table-count")).toContainText("41–50 of 53");
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "25");
    await expect(rows).toHaveCount(25);
    await expect(nav.locator(".table-count")).toContainText("1–25 of 53");
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "50");
    await expect(rows).toHaveCount(50);
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "10");
    await nav.getByRole("button", { name: "Last page", exact: true }).click();
    await page.getByRole("searchbox").fill(screen.query);
    await expect(nav.locator(".table-count")).toContainText(`1–10 of ${screen.matches}`);
    await nav.getByRole("button", { name: "Last page", exact: true }).click();
    await expect(page.getByRole("searchbox")).toHaveValue(screen.query);
    await expect(rows).toHaveCount(screen.matches - 20);
    await page.getByRole("searchbox").fill("no-matches-here");
    await expect(rows).toHaveCount(0);
    await expect(nav.locator(".table-count")).toContainText("0–0 of 0");
    await expect(nav.getByRole("button", { name: "Last page", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(nav.locator(".table-count")).toContainText("1–10 of 53");
  }
});

for (const count of [0, 7, 10]) {
  test(`${count} records have accurate bounds and disabled navigation in every module`, async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, count);
    for (const screen of screens) {
      await page.goto(screen.path + period);
      const nav = pagination(page, screen.caption);
      await expect(page.getByRole("region", { name: screen.caption, exact: true }).locator("tbody tr")).toHaveCount(count);
      await expect(nav.locator(".table-count")).toContainText(`${count ? 1 : 0}–${count} of ${count}`);
      for (const label of ["First page", "Previous page", "Next page", "Last page"])
        await expect(nav.getByRole("button", { name: label, exact: true })).toBeDisabled();
    }
  });
}

test("Menu filters and reporting dates reset page without clearing search or page size", async ({ page }) => {
  await seed(page);
  await page.goto("/app/menu");
  const menu = pagination(page, "Menu products");
  await menu.getByRole("button", { name: "Last page", exact: true }).click();
  await chooseOption(page, page.getByRole("combobox", { name: "Availability", exact: true }), "Available");
  await expect(menu.locator(".table-count")).toContainText("1–10 of 23");
  await menu.getByRole("button", { name: "Last page", exact: true }).click();
  await chooseOption(page, page.getByRole("combobox", { name: "Category", exact: true }), "Tea category 24");
  await expect(menu.locator(".table-count")).toContainText("0–0 of 0");
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(menu.locator(".table-count")).toContainText("1–10 of 53");
  for (const screen of [screens[2], screens[3]]) {
    await page.goto(screen.path + period);
    const nav = pagination(page, screen.caption);
    const query = screen.path === "/expenses" ? "expense" : screen.query;
    const matches = screen.path === "/expenses" ? 52 : 29;
    await page.getByRole("searchbox").fill(query);
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "25");
    await nav.getByRole("button", { name: "Next page", exact: true }).click();
    await page.getByLabel("From Date", { exact: true }).fill("2026-11-02");
    await expect(nav.locator(".table-count")).toContainText(`1–25 of ${matches}`);
    await expect(page.getByRole("searchbox")).toHaveValue(query);
    await expect(nav.getByRole("combobox", { name: "Rows per page" })).toContainText("25");
  }
});

test("sorting resets pages predictably and refresh preserves rows while disabling paging", async ({ page }) => {
  await page.goto("/?pagination");
  const nav = pagination(page, "Products");
  const rows = page.getByRole("region", { name: "Products", exact: true }).locator("tbody tr");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: /Price/ }).click();
  await expect(nav.locator(".table-count")).toContainText("1–10 of 53");
  await expect(rows.first()).toContainText("Record 53");
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "ascending");
  await nav.getByRole("button", { name: "Next page", exact: true }).click();
  await page.getByRole("button", { name: /Price/ }).click();
  await expect(rows.first()).toContainText("Record 01");
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "descending");
  const region = page.getByRole("region", { name: "Products", exact: true });
  const tableHeight = (await region.boundingBox())!.height;
  await page.getByRole("button", { name: "Toggle loading" }).click();
  await expect(region.locator("tbody")).toBeVisible();
  await expect(region.locator("tbody")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  expect((await region.boundingBox())!.height).toBe(tableHeight);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 53");
  await expect(nav.getByRole("combobox", { name: "Rows per page" })).toBeDisabled();
  for (const label of ["First page", "Previous page", "Next page", "Last page"])
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Toggle loading" }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toBeVisible();
});

test("category CRUD preserves pages and clamps after deleting or editing the last matching row", async ({ page }) => {
  await seed(page, 11);
  await page.goto("/libraries");
  const nav = pagination(page, "Product categories");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("ZZ new category");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("11–12 of 12");
  await page.getByRole("button", { name: "Edit category ZZ new category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("ZZ edited category");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("11–12 of 12");
  for (const name of ["Coffee category 11", "ZZ edited category"]) {
    await page.getByRole("button", { name: `Delete category ${name}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: `Delete category ${name}`, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete category", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  }
  await expect(nav.locator(".table-count")).toContainText("1–10 of 10");
  await page.getByRole("searchbox").fill("Coffee");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Coffee added");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Edit category Coffee category 10", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Tea moved");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 10");
  await expect(page.getByRole("searchbox")).toHaveValue("Coffee");
});

test("Sales and Expenses summaries and every CSV retain the full reporting period", async ({ page }) => {
  await seed(page);
  for (const screen of [screens[3], screens[2]]) {
    await page.goto(screen.path + period);
    const nav = pagination(page, screen.caption);
    const overview = page.locator(screen.path === "/expenses" ? ".expenses-overview" : ".sales-overview");
    const summary = await overview.innerText();
    await nav.getByRole("button", { name: "Last page", exact: true }).click();
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "25");
    await page.getByRole("searchbox").fill("no-matches-here");
    expect(await overview.innerText()).toBe(summary);
  }
  await expect(page.locator(".sales-transaction-metrics")).toContainText("₱7,685.00");
  for (const option of ["Profit summary", "Sales history", "Operating expenses"]) {
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export sales data" });
    await dialog.getByRole("radio", { name: new RegExp(option) }).check();
    const downloaded = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download CSV", exact: true }).click();
    const csv = await readFile((await (await downloaded).path())!, "utf8");
    if (option === "Profit summary") expect(csv).toContain('"Net profit","3975.00","PHP"');
    if (option === "Sales history") { expect(csv).toContain(uid(400)); expect(csv).toContain(uid(452)); }
    if (option === "Operating expenses") { expect(csv).toContain("Coffee expense 01"); expect(csv).toContain("Tea expense 53"); }
  }
});

test("product CRUD preserves active search and clamps after removing the final page", async ({ page }) => {
  await seed(page, 11);
  await page.goto("/app/menu");
  const nav = pagination(page, "Menu products");
  await page.getByRole("searchbox").fill("Coffee");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Edit Coffee product 11", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Tea moved product");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 10");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Coffee new product");
  await page.getByLabel("Selling price (PHP)", { exact: true }).fill("145");
  await page.getByLabel("Cost per item (PHP)", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 11");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Delete product Coffee product 10", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete product", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 10");
  await expect(page.getByRole("searchbox")).toHaveValue("Coffee");
});

test("expense CRUD respects filtered pages and retains voided records in the count", async ({ page }) => {
  await seed(page, 11);
  await page.goto("/expenses" + period);
  const nav = pagination(page, "Expense records");
  await page.getByRole("searchbox").fill("Coffee");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Edit expense Coffee expense 11", exact: true }).click();
  await page.getByLabel("Description", { exact: true }).fill("Tea moved expense");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 10");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await page.getByLabel("Description", { exact: true }).fill("Coffee new expense");
  await page.getByLabel("Amount (PHP)", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("1–10 of 11");
  await nav.getByRole("button", { name: "Last page", exact: true }).click();
  await page.getByRole("button", { name: "Delete expense Coffee expense 10", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(nav.locator(".table-count")).toContainText("11–11 of 11");
  await expect(page.getByRole("row").filter({ hasText: "Coffee expense 10" })).toContainText("Voided");
  await expect(page.getByLabel("Expenses overview")).toContainText("₱250.00");
});

test("pagination stays accessible across modules, reloads and responsive layouts", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await seed(page);
  for (const screen of screens) {
    await page.goto(screen.path + period);
    const nav = pagination(page, screen.caption);
    for (const viewport of [
      { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 },
      { width: 375, height: 812 }, { width: 812, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      await nav.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const box = (await nav.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      for (const button of await nav.getByRole("button").all()) {
        const size = (await button.boundingBox())!;
        expect(size.width).toBeGreaterThanOrEqual(viewport.width >= 1280 ? 40 : 44);
        expect(size.height).toBeGreaterThanOrEqual(viewport.width >= 1280 ? 40 : 44);
      }
      await page.screenshot({ path: info.outputPath(`${screen.path.replaceAll("/", "-")}-${viewport.width}.png`) });
    }
    const next = nav.getByRole("button", { name: "Next page", exact: true });
    await next.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Next page");
    await page.keyboard.press("Enter");
    await expect(nav.locator(".table-count")).toContainText("11–20 of 53");
    await page.reload();
    await expect(nav.locator(".table-count")).toContainText("1–10 of 53");
  }
  expect(errors).toEqual([]);
  for (const [name, caption, count] of [
    ["Menu", "Menu products", 53], ["Sales", "Sales history", 52],
    ["Expenses", "Expense records", 52], ["Libraries", "Product categories", 53],
  ] as const) {
    const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation", { name: "Shop", exact: true })
      .getByRole("link", { name, exact: true }).click();
    await expect(pagination(page, caption).locator(".table-count")).toContainText(`1–10 of ${count}`);
  }
});
