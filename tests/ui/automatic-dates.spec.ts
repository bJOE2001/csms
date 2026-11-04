import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";

declare global { interface Window { reportRequests: string[]; dateTypingTimers: number } }
async function recordRequests(page: Page) {
  await page.addInitScript(() => {
    window.reportRequests = [];
    window.dateTypingTimers = 0;
    window.addEventListener("fixture:report-request", event => window.reportRequests.push((event as CustomEvent<string>).detail));
    const timeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 350) window.dateTypingTimers++;
      return timeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
  });
}
async function chooseDate(page: Page, field: string, date: string) {
  await page.getByRole("button", { name: `Open ${field} calendar`, exact: true }).click();
  await page.getByRole("dialog", { name: `${field} calendar`, exact: true }).locator(`[data-day="${date}"] button`).click();
}
const modules = [
  { path: "/app/sales", summary: ".sales-transaction-metrics", caption: "Sales history", initial: "₱145.00" },
  { path: "/expenses", summary: ".expenses-overview", caption: "Expense records", initial: "₱20.00" },
];

for (const screen of modules) {
  test(`${screen.path} applies calendar dates immediately and coalesces valid typing`, async ({ page }) => {
    await recordRequests(page);
    await page.goto(screen.path);
    await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
    await chooseDate(page, "From Date", "2026-11-01");
    await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02/);
    expect(await page.evaluate(() => window.dateTypingTimers)).toBe(0);
    await chooseDate(page, "To Date", "2026-11-04");
    await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-04/);
    expect(await page.evaluate(() => window.reportRequests.length)).toBe(2);
    expect(await page.evaluate(() => window.dateTypingTimers)).toBe(0);
    await expect(page.locator(".sales-period")).toContainText("Nov 1");
    await expect(page.locator(".sales-period")).toContainText("4, 2026");
    const from = page.getByLabel("From Date", { exact: true });
    await from.fill("2026-10-01");
    await from.fill("2026-10-02");
    await from.fill("2026-10-03");
    await expect(page).toHaveURL(/from=2026-10-03&to=2026-11-04/);
    expect(await page.evaluate(() => window.reportRequests.length)).toBe(3);
    await from.fill("2026-11-05");
    await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
    await from.clear();
    await expect(page.getByRole("alert")).toContainText("Choose both dates");
    await from.fill("Feb 30, 2026");
    await expect(page.getByRole("alert")).toContainText("Choose valid dates");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.reportRequests.length)).toBe(3);
    await expect(page.locator(screen.summary)).toContainText(screen.initial);
  });

  test(`${screen.path} keeps loaded results and exports on failure, then retries without a button`, async ({ page }) => {
    await recordRequests(page);
    await page.goto(screen.path);
    const loadedSummary = (await page.locator(screen.summary).textContent())!;
    const period = await page.locator(".sales-period").innerText();
    await page.getByRole("searchbox").fill(screen.path.includes("sales") ? "cash" : "Electricity");
    await page.evaluate(() => sessionStorage.setItem("fixture:report-error", "Report could not be updated. Your previous results are still shown."));
    await chooseDate(page, "From Date", "2026-11-01");
    await expect(page.getByRole("alert")).toContainText("previous results");
    await expect(page.locator(screen.summary)).toHaveText(loadedSummary);
    await expect(page.locator(".sales-period")).toHaveText(period);
    await expect(page.getByRole("region", { name: screen.caption, exact: true }).locator("tbody tr")).toHaveCount(1);
    if (screen.path.includes("sales")) {
      await page.getByRole("button", { name: "Export CSV", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Export sales data" })).toContainText("2026-11-02 — 2026-11-02");
      await page.keyboard.press("Escape");
    }
    await page.evaluate(() => sessionStorage.removeItem("fixture:report-error"));
    await chooseDate(page, "From Date", "2026-11-01");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator(".sales-period")).toContainText("Nov 1");
    await expect(page.getByRole("searchbox")).toHaveValue(screen.path.includes("sales") ? "cash" : "Electricity");
    expect(await page.evaluate(() => window.reportRequests.length)).toBe(2);
  });
}

test("rapid selections supersede pending navigation, including a return to the loaded range", async ({ page }) => {
  await recordRequests(page);
  await page.goto("/app/sales");
  await page.evaluate(() => sessionStorage.setItem("fixture:navigation-delay", "1000"));
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page.locator(".global-loading-bar[data-busy=true]")).toBeVisible();
  await expect(page.locator(".sales-period")).toHaveText("Reporting period: Nov 2, 2026");
  await chooseDate(page, "From Date", "2026-11-02");
  await expect.poll(() => page.evaluate(() => window.reportRequests.length)).toBe(2);
  await expect(page).toHaveURL(/from=2026-11-02&to=2026-11-02/);
  await chooseDate(page, "To Date", "2026-11-04");
  await expect.poll(() => page.evaluate(() => window.reportRequests.length)).toBe(3);
  await expect(page.locator(".global-loading-bar[data-busy=true]")).toHaveCount(0);
  await expect(page.locator(".sales-period")).toContainText("Nov 2");
  await expect(page.locator(".sales-period")).toContainText("4, 2026");
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue("Nov 2, 2026");
  await expect(page.getByLabel("To Date", { exact: true })).toHaveValue("Nov 4, 2026");
  await expect(page.locator(".sales-transaction-metrics")).toContainText("₱145.00");
});

test("navigation errors and an initially unavailable report never invent zero totals", async ({ page }) => {
  await recordRequests(page);
  await page.goto("/expenses");
  await page.evaluate(() => sessionStorage.setItem("fixture:throw-navigation", "1"));
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page.getByRole("alert")).toContainText("previous results");
  await expect(page.locator(".expenses-overview")).toContainText("₱20.00");
  await page.evaluate(() => sessionStorage.removeItem("fixture:throw-navigation"));
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02/);
  await page.evaluate(() => sessionStorage.setItem("fixture:report-error", "Expenses could not be updated."));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("could not be updated");
  await expect(page.locator(".expenses-overview")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem("fixture:report-error"));
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page.locator(".expenses-overview")).toContainText("₱20.00");
});

test("offline date changes keep the loaded report and recover on the next selection", async ({ page, context }) => {
  await recordRequests(page);
  await page.goto("/expenses");
  await context.setOffline(true);
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page.getByRole("alert")).toContainText("offline");
  await expect(page.locator(".expenses-overview")).toContainText("₱20.00");
  expect(await page.evaluate(() => window.reportRequests.length)).toBe(0);
  await context.setOffline(false);
  await chooseDate(page, "From Date", "2026-11-01");
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02/);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an externally applied period synchronizes the fields without navigating back to old dates", async ({ page }) => {
  await recordRequests(page);
  await page.goto("/app/sales");
  await page.evaluate(() => {
    history.replaceState(null, "", "/app/sales?from=2026-10-01&to=2026-10-31");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue("Oct 1, 2026");
  await expect(page.getByLabel("To Date", { exact: true })).toHaveValue("Oct 31, 2026");
  await expect(page.locator(".sales-period")).toContainText("Oct 1");
  expect(await page.evaluate(() => window.reportRequests.length)).toBe(0);
});

test("new periods reset only the page while complete totals, search and page size stay correct", async ({ page }) => {
  const uid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000001`;
  await page.addInitScript(({ uidSales, uidExpenses }) => {
    sessionStorage.setItem("fixture-sales", JSON.stringify(uidSales));
    sessionStorage.setItem("fixture-expenses", JSON.stringify(uidExpenses));
  }, {
    uidSales: Array.from({ length: 53 }, (_, i) => ({ id: uid(i + 1), created_at: i === 52 ? "2026-11-01T04:00:00Z" : "2026-11-02T04:00:00Z", total_cents: 10000, total_cost_cents: 4000, method: "cash", status: "completed", payment_status: "confirmed", tendered_cents: 10000, refund_reason: null, items: [] })),
    uidExpenses: Array.from({ length: 53 }, (_, i) => ({ id: uid(i + 100), spent_on: i === 52 ? "2026-11-01" : "2026-11-02", description: `Coffee charge ${i}`, amount_cents: 2000, voided: false })),
  });
  for (const screen of modules) {
    await page.goto(screen.path);
    const nav = page.getByRole("navigation", { name: `${screen.caption} pagination`, exact: true });
    await page.getByRole("searchbox").fill(screen.path.includes("sales") ? "cash" : "Coffee");
    await chooseOption(page, nav.getByRole("combobox", { name: "Rows per page" }), "25");
    await nav.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(nav.locator(".table-count")).toContainText("26–50 of 52");
    await chooseDate(page, "From Date", "2026-11-01");
    await expect(nav.locator(".table-count")).toContainText("1–25 of 53");
    await expect(nav.getByRole("combobox", { name: "Rows per page" })).toContainText("25");
    await expect(page.getByRole("searchbox")).toHaveValue(screen.path.includes("sales") ? "cash" : "Coffee");
    await expect(page.locator(screen.summary)).toContainText(screen.path.includes("sales") ? "₱5,300.00" : "₱1,060.00");
  }
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`date controls keep their aligned layout without an Apply gap at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    for (const screen of modules) {
      await page.goto(screen.path);
      const from = (await page.getByLabel("From Date", { exact: true }).locator("..").boundingBox())!;
      const to = (await page.getByLabel("To Date", { exact: true }).locator("..").boundingBox())!;
      expect(from.height).toBe(44);
      expect(to.height).toBe(44);
      if (viewport.width >= 768) {
        expect(from.y).toBe(to.y);
        expect(to.x - from.x - from.width).toBe(12);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${screen.path.includes("sales") ? "sales" : "expenses"}-${viewport.width}.png`) });
    }
  });
}
