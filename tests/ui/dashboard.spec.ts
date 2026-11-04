import { expect, test } from "@playwright/test";
import { chooseOption } from "../helpers/select";

const reportUrl = "/dashboard?from=2026-10-01&to=2026-11-03";
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 }, { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`Dashboard layout and real chart geometry at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(reportUrl);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.locator(".dashboard-kpi")).toHaveCount(3);
    await expect(page.locator(".dashboard-kpi").first()).toContainText("Net Sales");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await page.locator(".dashboard-kpi").evaluateAll(items => items.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    if (viewport.width >= 1032) expect(new Set(boxes.map(box => box.y)).size).toBe(1);
    if (viewport.width < 600) expect(new Set(boxes.map(box => box.x)).size).toBe(1);
    await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/dashboard/top-${viewport.width}.png` });
    await page.locator(".dashboard-line-chart").scrollIntoViewIfNeeded();
    const chart = page.locator(".dashboard-line-chart");
    expect(await chart.locator("text").first().evaluate(el => getComputedStyle(el).fontSize)).toBe("12px");
    expect(await chart.evaluate(el => Math.abs((el as SVGSVGElement).viewBox.baseVal.width - el.clientWidth))).toBeLessThan(2);
    await page.screenshot({ path: `.local/ui-review/dashboard/chart-${viewport.width}.png` });
    await page.getByRole("heading", { name: "Recent Transactions" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("region", { name: "Recent transactions", exact: true }).locator("tbody tr")).toHaveCount(5);
    await expect(page.getByRole("link", { name: "View all sales", exact: true })).toHaveAttribute("href", "/app/sales?from=2026-10-01&to=2026-11-03");
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/dashboard/details-${viewport.width}.png` });
  });
}

test("Dashboard preserves receipts, accessible chart values, payments and navigation", async ({ page }) => {
  await page.goto(reportUrl);
  const nav = page.getByRole("navigation", { name: "Shop", exact: true });
  expect(await nav.getByRole("link").allTextContents()).toEqual(["Dashboard", "POS", "Menu", "Sales", "Expenses", "Libraries"]);
  await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  const selector = page.getByRole("combobox", { name: "Inspect sales period" });
  await expect(selector).toBeHidden();
  await page.getByText("View chart data", { exact: true }).click();
  await chooseOption(page, selector, "Oct 2, 2026");
  await expect(page.getByLabel("Selected period net sales")).toHaveText("₱290.00");
  await expect(page.getByRole("tooltip")).toContainText("₱290.00");
  await selector.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(selector).toBeFocused();
  await expect(page.getByRole("table", { name: "Daily net sales in PHP" })).toBeVisible();
  await expect(page.locator(".payment-breakdown-legend")).toContainText("Cash");
  await page.locator(".dashboard-category-note summary").click();
  await expect(page.getByText(/Categories were not saved/)).toBeVisible();
  const recent = page.getByRole("region", { name: "Recent transactions", exact: true });
  await recent.getByRole("button", { name: /^View receipt / }).first().click();
  await expect(page.getByRole("dialog", { name: "Sale receipt", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Dashboard automatic dates retain the last valid report on failed and rapid refreshes", async ({ page }) => {
  await page.goto(reportUrl);
  const original = (await page.locator(".dashboard-kpis").textContent())!;
  const period = await page.locator(".sales-period").innerText();
  await page.evaluate(() => sessionStorage.setItem("fixture:report-error", "Dashboard could not be updated. Previous results remain shown."));
  await page.getByLabel("From Date", { exact: true }).fill("2026-10-02");
  await expect(page.getByRole("alert")).toContainText("Previous results");
  await expect(page.locator(".dashboard-kpis")).toHaveText(original);
  await expect(page.locator(".sales-period")).toContainText(period);
  await expect(page.locator(".sales-period")).toContainText("update failed");
  await page.evaluate(() => { sessionStorage.removeItem("fixture:report-error"); sessionStorage.setItem("fixture:navigation-delay", "600"); });
  const from = page.getByLabel("From Date", { exact: true });
  await from.fill("2026-10-03");
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  await from.fill("2026-10-04");
  await expect(page).toHaveURL(/from=2026-10-04/);
  await expect(page.locator(".sales-period")).toContainText("Oct 4");
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
  await from.fill("2026-12-01");
  await expect(page.getByRole("alert")).toContainText("To Date");
  await expect(page.locator(".sales-period")).toContainText("Oct 4");
});

test("Dashboard distinguishes empty, missing-cost, and unavailable reports", async ({ page }) => {
  await page.goto("/dashboard?empty");
  await expect(page.locator(".dashboard-kpis")).toContainText("₱0.00");
  await expect(page.getByText("No completed sales in this period.")).toBeVisible();
  await expect(page.getByText("No payment revenue in this period.")).toBeVisible();
  await expect(page.locator(".dashboard-line-chart")).toHaveCount(0);
  await page.goto("/dashboard?missing");
  await expect(page.locator(".dashboard-kpis")).toContainText("Incomplete");
  await expect(page.getByText(/Profit is incomplete:/)).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("fixture:report-error", "Dashboard could not be updated."));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("could not be updated");
  await expect(page.locator(".dashboard-kpis")).toHaveCount(0);
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
});
