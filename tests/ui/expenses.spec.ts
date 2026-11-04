import { test, expect, type Page } from "@playwright/test";
import type { Expense } from "../../src/lib/sales/domain";

const electricity: Expense = {
  id: "00000000-0000-4000-8000-000000000003",
  spent_on: "2026-11-02", description: "Electricity", amount_cents: 2000, voided: false,
};
async function expenseApi(page: Page, initial: Expense[] = [electricity], failFirstAction?: string) {
  const records = initial.map(expense => ({ ...expense }));
  const calls: { action: string; data: Expense & { operation_id?: string; expected?: unknown } }[] = [];
  await page.addInitScript(seed => {
    if (!sessionStorage.getItem("fixture-expenses"))
      sessionStorage.setItem("fixture-expenses", JSON.stringify(seed));
  }, records);
  await page.route("**/api/pos", async route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === failFirstAction && calls.filter(call => call.action === body.action).length === 1)
      return route.fulfill({ status: 503, json: { error: "Connection interrupted. Retry the same entry." } });
    const existing = records.find(expense => expense.id === body.data.id);
    if (body.action === "expense" && !existing) records.push({ ...body.data, voided: false });
    if (body.action === "update_expense" && existing)
      Object.assign(existing, { spent_on: body.data.spent_on, description: body.data.description, amount_cents: body.data.amount_cents });
    if (body.action === "void_expense" && existing) existing.voided = true;
    await page.evaluate(value => sessionStorage.setItem("fixture-expenses", JSON.stringify(value)), records);
    await route.fulfill({ json: { data: existing ?? records.at(-1) } });
  });
  return calls;
}
async function openModule(page: Page, name: "Dashboard" | "Expenses") {
  await page.getByRole("navigation", { name: "Shop" }).getByRole("link", { name, exact: true }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: name === "Expenses" ? "Expenses Management" : "Dashboard", exact: true })).toBeVisible({ timeout: 15000 });
}

test("expense create, edit and retained deletion refresh Expenses and Dashboard profitability", async ({ page }) => {
  test.setTimeout(180000);
  const calls = await expenseApi(page);
  await page.goto("/expenses");
  await expect(page.getByRole("link", { name: "Expenses", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Expenses overview")).toContainText("₱20.00");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await page.getByLabel("Description", { exact: true }).fill("Rent");
  await page.getByLabel("Amount (PHP)").fill("100.25");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Expenses overview")).toContainText("₱120.25");
  await expect(page.getByLabel("Expenses overview")).toContainText("₱60.13");
  await openModule(page, "Dashboard");
  await expect(page.locator(".dashboard-kpi").nth(2)).toContainText("-₱25.25");
  await expect(page.getByRole("button", { name: "Add Expense", exact: true })).toHaveCount(0);
  await openModule(page, "Expenses");
  await page.getByRole("button", { name: "Edit expense Rent", exact: true }).click();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Rent");
  await expect(page.getByLabel("Amount (PHP)")).toHaveValue("100.25");
  await expect(page.getByLabel("Expense date", { exact: true })).toHaveValue("Nov 2, 2026");
  await page.getByLabel("Amount (PHP)").fill("200.00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Expenses overview")).toContainText("₱220.00");
  await openModule(page, "Dashboard");
  await expect(page.locator(".dashboard-kpi").nth(2)).toContainText("-₱125.00");
  await openModule(page, "Expenses");
  await page.getByRole("button", { name: "Delete expense Rent", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Rent · ₱200.00");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(calls.filter(call => call.action === "void_expense")).toHaveLength(0);
  await page.getByRole("button", { name: "Delete expense Rent", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "Rent" })).toContainText("Voided");
  await expect(page.getByLabel("Expenses overview")).toContainText("₱20.00");
  await expect(page.getByRole("button", { name: "Edit expense Rent", exact: true })).toHaveCount(0);
  await openModule(page, "Dashboard");
  await expect(page.locator(".dashboard-kpi").nth(2)).toContainText("₱75.00");
  expect(calls.map(call => call.action)).toEqual(["expense", "update_expense", "void_expense"]);
  expect(calls[1].data).toMatchObject({ expected: { spent_on: "2026-11-02", description: "Rent", amount_cents: 10025 } });
});

test("failed edits retain the draft and retry the same operation without duplicates", async ({ page }) => {
  const calls = await expenseApi(page, [electricity], "update_expense");
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Edit expense Electricity", exact: true }).click();
  await page.getByLabel("Description", { exact: true }).fill("Power bill");
  await page.getByLabel("Amount (PHP)").fill("50.75");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Connection interrupted");
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Power bill");
  await expect(page.getByLabel("Amount (PHP)")).toHaveValue("50.75");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Expenses overview")).toContainText("₱50.75");
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0].data.operation_id).toBeTruthy();
});

test("required fields and invalid amounts cannot create expense records", async ({ page }) => {
  const calls = await expenseApi(page);
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const description = page.getByLabel("Description", { exact: true });
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  expect(await description.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await description.fill("Rent");
  for (const value of ["0", "1000000.01", "1.123"]) {
    await page.getByLabel("Amount (PHP)").fill(value);
    await page.getByRole("button", { name: "Save expense", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  }
  expect(calls).toHaveLength(0);
});

test("date filtering is inclusive, search is functional and empty periods remain compact", async ({ page }) => {
  await expenseApi(page, [electricity,
    { ...electricity, id: "00000000-0000-4000-8000-000000000004", spent_on: "2026-11-03", description: "Internet", amount_cents: 4000 },
    { ...electricity, id: "00000000-0000-4000-8000-000000000005", description: "Old entry", amount_cents: 50000, voided: true },
  ]);
  await page.goto("/expenses");
  await page.getByRole("searchbox").fill("nothing-matches");
  await expect(page.getByText("No matching records. Try a different search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByLabel("From Date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("To Date", { exact: true }).fill("2026-11-03");
  await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-03/);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { name: "Expenses Management" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Expenses overview")).toContainText("₱60.00");
  await expect(page.getByLabel("Expenses overview")).toContainText("₱30.00");
  await page.getByLabel("From Date", { exact: true }).fill("2026-12-01");
  await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-03/);
  await page.getByLabel("To Date", { exact: true }).fill("2026-12-31");
  await expect(page).toHaveURL(/from=2026-12-01&to=2026-12-31/);
  await expect(page.getByText("No expenses recorded for the selected period.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Sales date shortcuts" })).toHaveCount(0);
});

test("staff can read expenses but cannot see management actions", async ({ page }) => {
  await page.goto("/expenses?staff");
  await expect(page.getByText("You can view expenses. An owner manages expense records.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add Expense|Edit expense|Delete expense/ })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "Electricity", exact: true })).toBeVisible();
});

test("Expenses remains responsive with shared navigation and one scroll owner", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/expenses");
  for (const size of [
    { width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 },
    { width: 768, height: 1024 }, { width: 812, height: 375 }, { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (size.width >= 761) expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(size.height);
    if (size.width >= 1280)
      await expect(page.getByRole("link", { name: "Expenses", exact: true })).toBeVisible();
    else
      await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`expenses-${size.width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});
