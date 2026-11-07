import { expect, test } from "@playwright/test";

const reportUrl = "/dashboard?from=2026-10-01&to=2026-11-03";
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 }, { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`Dashboard layout and real chart geometry at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(reportUrl);
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.locator(".dashboard-kpi")).toHaveCount(3);
    await expect(page.locator(".dashboard-kpi").first()).toContainText("Net Sales");
    await expect(page.locator(".dashboard-metrics dt")).toHaveText([
      "Completed Sales", "Product Costs", "Operating Expenses", "Cash Sales", "E-wallet Sales", "Refunded Transactions",
    ]);
    await expect(page.getByText("Average Order Value", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Product Insights", exact: true })).toHaveCount(0);
    await expect(page.getByText("Category Performance", { exact: false })).toHaveCount(0);
    await expect(page.locator(".dashboard-supporting-analytics")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Payment Breakdown", exact: true })).toHaveCount(0);
    await expect(page.locator(".dashboard-payments, .skeleton-payment")).toHaveCount(0);
    const metrics = page.locator(".dashboard-metrics");
    const metricRows = await metrics.locator(":scope > div").evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
    expect(new Set(metricRows).size).toBe(viewport.width >= 1280 ? 1 : viewport.width >= 768 ? 2 : 3);
    const metricsOverflow = await metrics.evaluate(el => el.scrollWidth > el.clientWidth);
    expect(metricsOverflow).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await page.locator(".dashboard-kpi").evaluateAll(items => items.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; }));
    if (viewport.width >= 1032) expect(new Set(boxes.map(box => box.y)).size).toBe(1);
    if (viewport.width < 600) expect(new Set(boxes.map(box => box.x)).size).toBe(1);
    await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
    await expect(page.getByText("View chart data", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ranking details", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/dashboard/top-${viewport.width}.png` });
    await page.locator(".dashboard-line-chart").scrollIntoViewIfNeeded();
    const chart = page.locator(".dashboard-line-chart");
    expect(await chart.locator("text").first().evaluate(el => getComputedStyle(el).fontSize)).toBe("12px");
    expect(await chart.evaluate(el => Math.abs((el as SVGSVGElement).viewBox.baseVal.width - el.clientWidth))).toBeLessThan(2);
    await page.screenshot({ path: `.local/ui-review/dashboard/chart-${viewport.width}.png` });
    await expect(page.getByRole("heading", { name: "Recent Transactions" })).toHaveCount(0);
    await expect(page.locator(".sales-history")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View all sales", exact: true })).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/dashboard/details-${viewport.width}.png` });
  });
}

test("Dashboard preserves accessible chart values, payments and navigation", async ({ page }) => {
  await page.goto(reportUrl);
  const nav = page.getByRole("navigation", { name: "Shop", exact: true });
  expect(await nav.getByRole("link").allTextContents()).toEqual(["Dashboard", "POS", "Menu", "Inventory", "Sales", "Expenses", "Libraries"]);
  await expect(nav.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  const chart = page.getByRole("img", { name: /Net Sales performance in PHP/ });
  await chart.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tooltip")).toContainText("Oct 2, 2026");
  await expect(page.getByRole("tooltip")).toContainText("₱290.00");
  await page.keyboard.press("End");
  await expect(page.getByRole("tooltip")).toContainText("Nov 3, 2026");
  await expect(chart).toBeFocused();
  await expect(chart).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("table", { name: "Daily net sales in PHP" }).locator("..")).toHaveClass("sr-only");
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("Cash Sales", { exact: true }) }).locator("dd")).toHaveText("₱4,035.00");
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("E-wallet Sales", { exact: true }) }).locator("dd")).toHaveText("₱2,290.00");
  await expect(page.locator(".dashboard-kpi").filter({ has: page.getByText("Net Sales", { exact: true }) }).locator("dd")).toHaveText("₱6,325.00");
  await expect(page.getByText("About size history", { exact: true })).toHaveCount(0);
  await nav.getByRole("link", { name: "Sales", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sales History", exact: true })).toBeVisible();
});

test("Dashboard automatic dates retain the last valid report on failed and rapid refreshes", async ({ page }) => {
  await page.goto(reportUrl);
  const original = (await page.locator(".dashboard-kpis").textContent())!;
  const originalMetrics = (await page.locator(".dashboard-metrics").textContent())!;
  const firstPeriod = page.getByRole("table", { name: "Daily net sales in PHP" }).locator("tbody th").first();
  const period = await firstPeriod.innerText();
  await page.evaluate(() => sessionStorage.setItem("fixture:report-error", "Dashboard could not be updated. Previous results remain shown."));
  await page.getByLabel("From Date", { exact: true }).fill("2026-10-02");
  await expect(page.getByRole("alert")).toContainText("Previous results");
  await expect(page.locator(".dashboard-kpis")).toHaveText(original);
  await expect(page.locator(".dashboard-metrics")).toHaveText(originalMetrics);
  await expect(firstPeriod).toHaveText(period);
  await page.evaluate(() => { sessionStorage.removeItem("fixture:report-error"); sessionStorage.setItem("fixture:navigation-delay", "600"); });
  const from = page.getByLabel("From Date", { exact: true });
  await from.fill("2026-10-03");
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "true");
  await from.fill("2026-10-04");
  await expect(page).toHaveURL(/from=2026-10-04/);
  await expect(firstPeriod).toHaveText("Oct 4, 2026");
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("Cash Sales", { exact: true }) }).locator("dd")).toHaveText("₱3,635.00");
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("E-wallet Sales", { exact: true }) }).locator("dd")).toHaveText("₱2,290.00");
  await expect(page.locator(".global-loading-bar")).toHaveAttribute("data-busy", "false");
  await from.fill("2026-12-01");
  await expect(page.getByRole("alert")).toContainText("To Date");
  await expect(firstPeriod).toHaveText("Oct 4, 2026");
});

test("Dashboard distinguishes empty, missing-cost, and unavailable reports", async ({ page }) => {
  await page.goto("/dashboard?empty");
  await expect(page.locator(".dashboard-kpis")).toContainText("₱0.00");
  await expect(page.getByText("No completed sales in this period.")).toBeVisible();
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("Cash Sales", { exact: true }) }).locator("dd")).toHaveText("₱0.00");
  await expect(page.locator(".dashboard-metrics > div").filter({ has: page.getByText("E-wallet Sales", { exact: true }) }).locator("dd")).toHaveText("₱0.00");
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
