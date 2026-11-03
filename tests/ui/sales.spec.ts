import { test, expect } from "@playwright/test";
test("sales shows revenue, receipt, date filters and a refund confirmation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales");
  await expect(
    page.getByRole("heading", { name: "Sales", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".crud-summary")).toContainText("145.00");
  await expect(page.locator(".crud-summary")).toContainText("95.00");
  await expect(page.locator(".crud-summary")).toContainText("75.00");
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue(
    "2026-11-02",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 812, height: 375 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`profit-${size.width}.png`),
      fullPage: true,
    });
  }
  const history = page.getByRole("region", { name: "Sales history", exact: true });
  expect(await history.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(history.locator('[data-label="Payment"]')).toContainText("Cash");
  await expect(history.locator('[data-label="Status"]')).toContainText("completed");
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByRole("dialog")).toContainText("Latte");
  await page.getByRole("button", { name: "Refund sale", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("desktop Sales fills the viewport and scrolls independently of the sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/?sales&many");
  const content = page.locator("#workspace-main");
  const sidebar = await page.locator(".workspace-sidebar").boundingBox();
  await content.hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.locator(".workspace-sidebar").boundingBox()).toEqual(
    sidebar,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(720);
  expect(await content.evaluate((el) =>
    [...el.querySelectorAll("*")].filter((child) =>
      child.scrollHeight > child.clientHeight + 1 &&
      ["auto", "scroll"].includes(getComputedStyle(child).overflowY),
    ).length,
  )).toBe(0);
  await expect(page.locator(".sales-history")).toBeInViewport();
});

test("history search, empty states, wallet totals and voided expenses remain accurate", async ({ page }) => {
  await page.goto("/?sales&wallet&voided");
  await expect(page.locator(".sales-secondary-metrics")).toContainText("₱145.00");
  await expect(page.locator(".crud-summary")).toContainText("₱95.00");
  const history = page.getByRole("region", { name: "Sales history", exact: true });
  await expect(history.getByRole("cell", { name: "GCash", exact: true })).toBeVisible();
  await expect(page.locator(".sales-expenses")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Void expense Electricity" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("not-a-receipt");
  await expect(history).toContainText("No matching records. Try a different search.");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(history.getByRole("button", { name: "View receipt" })).toBeVisible();
  await page.goto("/?sales&empty");
  await expect(page.getByText("No sales records found for the selected period.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage operating expenses:/ })).toContainText("₱0.00");
  await page.goto("/?sales&staff");
  await expect(page.getByRole("button", { name: "Add expense", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Void expense Electricity" })).toHaveCount(0);
});

test("dates apply automatically, preserve focus and reject incomplete or invalid ranges", async ({
  page,
}) => {
  await page.goto("/?sales");
  await expect(
    page.getByRole("navigation", { name: "Sales date shortcuts" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
  const from = page.getByLabel("From Date", { exact: true });
  const to = page.getByLabel("To Date", { exact: true });
  await from.clear();
  await expect(page.getByRole("alert")).toContainText("Choose both dates");
  await expect(page).toHaveURL(/\?sales$/);
  await from.fill("2026-12-01");
  await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
  expect(await to.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
  await expect(page).toHaveURL(/\?sales$/);
  await from.fill("2026-09-01");
  await to.fill("2026-09-30");
  await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-30/);
  await expect(page.locator(".crud-summary .panel").first()).toContainText("₱0.00");
  await expect(from).toHaveValue("2026-09-01");
  await expect(to).toHaveValue("2026-09-30");
  await expect(to).toBeFocused();
  await expect(page.getByRole("button", { name: "View receipt" })).toHaveCount(0);
  // Hold an earlier response while the user restores the previously loaded date.
  await page.evaluate(() => sessionStorage.setItem("fixture:hold-navigation", "true"));
  await from.fill("2026-09-02");
  await expect(page).toHaveURL(/from=2026-09-02&to=2026-09-30/);
  await expect(page.getByRole("link", { name: /Manage operating expenses:/ }))
    .toHaveAttribute("href", "/expenses?from=2026-09-01&to=2026-09-30");
  await from.fill("2026-09-01");
  await page.evaluate(() => {
    sessionStorage.removeItem("fixture:hold-navigation");
    window.dispatchEvent(new Event("fixture:navigate"));
  });
  await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-30/);
  await expect(from).toHaveValue("2026-09-01");
  await expect(page.getByRole("link", { name: /Manage operating expenses:/ }))
    .toHaveAttribute("href", "/expenses?from=2026-09-01&to=2026-09-30");
  await from.fill("2020-01-01");
  await expect(page.getByRole("alert")).toContainText("up to one year");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-30/);
  await page.goto("/?sales&period=month&wallet");
  await from.fill("2026-10-01");
  await expect(page).toHaveURL(/from=2026-10-01&to=2026-11-02/);
  expect(new URL(page.url()).searchParams.has("period")).toBe(false);
  expect(new URL(page.url()).searchParams.has("wallet")).toBe(true);
  await expect(page.locator(".sales-secondary-metrics")).toContainText("₱145.00");
  await page.goto("/?sales&missing");
  await expect(page.locator(".crud-summary .panel").nth(1)).toContainText("Incomplete");
  await expect(page.locator(".crud-summary .panel").nth(2)).toContainText("Incomplete");
});

test("owner can record the missing cost of a refunded receipt and retry a failed save", async ({
  page,
}, info) => {
  const calls: unknown[] = [];
  await page.route("**/api/pos", async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Connection interrupted. Retry the same entry." },
      });
    return route.fulfill({ json: { data: null } });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales&missing&refunded");
  await page.getByRole("button", { name: "View receipt" }).click();
  await page
    .getByRole("button", { name: "Record missing cost", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Record missing cost",
    exact: true,
  });
  await form.getByLabel("Total preparation cost (PHP)").fill("35.25");
  await form.getByLabel("Cost source / note").fill("Ingredient record");
  await page.screenshot({
    path: info.outputPath("record-cost-mobile.png"),
    fullPage: true,
  });
  await form
    .getByRole("button", { name: "Save preparation cost", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("Connection interrupted");
  await expect(form.getByLabel("Total preparation cost (PHP)")).toHaveValue(
    "35.25",
  );
  await form
    .getByRole("button", { name: "Save preparation cost", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]).toMatchObject({
    action: "record_cost",
    data: {
      id: "00000000-0000-4000-8000-000000000002",
      cost_cents: 3525,
      note: "Ingredient record",
    },
  });
  await page.goto("/?sales&missing&staff");
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(
    page.getByRole("button", { name: "Record missing cost", exact: true }),
  ).toHaveCount(0);
});

test("Sales links to expense management without embedding CRUD and preserves missing-cost reporting", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales");
  await expect(page.getByRole("button", { name: /Add Expense|Edit expense|Delete expense/ })).toHaveCount(0);
  const manageExpenses = page.getByRole("link", { name: /Manage operating expenses:/ });
  await expect(manageExpenses).toHaveAttribute("href", "/expenses?from=2026-11-02&to=2026-11-02");
  await manageExpenses.click();
  await expect(page.getByRole("heading", { name: "Expenses Management" })).toBeVisible();
  await page.goto("/?sales&missing");
  await expect(page.locator(".crud-summary")).toContainText("Incomplete");
  await expect(page.getByText(/Profit is incomplete:/)).toBeVisible();
});
