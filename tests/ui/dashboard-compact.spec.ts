import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const folder = ".local/ui-review/dashboard-simplified";
const baseline = process.env.DASHBOARD_CAPTURE_BASELINE === "1";
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 }, { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`compact Dashboard keeps financial content and usable geometry at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.goto("/dashboard?from=2026-10-01&to=2026-11-03", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
    });
    const measurements = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector)!;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      return {
        height: rect(".dashboard-management").height,
        kpis: [...document.querySelectorAll(".dashboard-kpi")].map(el => el.getBoundingClientRect().height),
        chart: rect(".dashboard-line-chart"),
        analyticsHeights: [...document.querySelectorAll(".dashboard-main-analytics > .dashboard-section")].map(el => el.getBoundingClientRect().height),
        sectionPositions: [...document.querySelectorAll(".dashboard-management h2")].map(el => ({ title: el.textContent, y: el.getBoundingClientRect().y })),
        financialValues: Object.fromEntries([...document.querySelectorAll(".dashboard-kpi, .dashboard-metrics > div")]
          .map(el => [el.querySelector("dt")!.textContent!, el.querySelector("dd")!.textContent])),
        topProducts: [...document.querySelectorAll(".performance-list")][0]?.textContent,
        rankingRows: [...document.querySelectorAll(".performance-list li")].map(el => el.getBoundingClientRect().height),
      };
    });
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/${baseline ? "before" : "after"}-${viewport.width}.json`, JSON.stringify(measurements, null, 2));
    await page.screenshot({ path: `${folder}/${baseline ? "before" : "after"}-${viewport.width}.png` });
    if (baseline) return;
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(measurements.chart.height).toBeGreaterThanOrEqual(220);
    expect(measurements.chart.height).toBeLessThanOrEqual(260);
    expect(Math.abs(measurements.analyticsHeights[0] - measurements.analyticsHeights[1])).toBeLessThan(1);
    await expect(page.locator(".chart-details, .chart-inspector, .dashboard-disclosure")).toHaveCount(0);
    await expect(page.getByText("View chart data", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Ranking details", { exact: true })).toHaveCount(0);
    const beforeFile = `${folder}/before-${viewport.width}.json`;
    if (existsSync(beforeFile)) {
      const before = JSON.parse(readFileSync(beforeFile, "utf8"));
      for (const [label, value] of Object.entries(measurements.financialValues))
        if (label !== "Refunded Transactions") expect(value).toBe(before.financialValues[label] ?? before.financialValues[label === "E-wallet Sales" ? "GCash / Wallet Sales" : label]);
      expect(measurements.topProducts).toBe(before.topProducts);
      expect(measurements.height).toBeLessThan(before.height);
    }
    if (viewport.width >= 1280) {
      expect(Math.max(...measurements.kpis)).toBeLessThanOrEqual(112);
      expect(Math.max(...measurements.kpis) - Math.min(...measurements.kpis)).toBeLessThan(1);
      expect(measurements.sectionPositions.find(item => item.title === "Top Products")!.y).toBeLessThan(500);
    }
  });
}

for (const width of [1440, 768, 393]) {
  test(`Dashboard preserves five historical rankings and large values at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => sessionStorage.setItem("fixture-sales", JSON.stringify(Array.from({ length: 6 }, (_, i) => ({
      id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000001`,
      created_at: "2026-11-02T12:00:00Z", total_cents: 987654321 + i, total_cost_cents: 100,
      method: i % 2 ? "gcash" : "cash", status: "completed", payment_status: "confirmed",
      items: [{ name: `${i} Historical product with a long name ${"Reserve".repeat(12)}`, size_label: `${i} Custom historical size label`, quantity: 12345 + i, unit_price_cents: 80000, line_total_cents: 987654321 + i }],
    })))));
    await page.goto("/dashboard?from=2026-10-01&to=2026-11-03");
    await expect(page.locator(".performance-list")).toHaveCount(1);
    await expect(page.locator(".performance-list li")).toHaveCount(5);
    await expect(page.locator(".sales-history")).toHaveCount(0);
    await expect(page.locator(".dashboard-kpis")).toContainText("₱59,259,259.41");
    const heights = await page.locator(".dashboard-main-analytics > .dashboard-section").evaluateAll(items => items.map(el => el.getBoundingClientRect().height));
    expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1);
    expect(await page.evaluate(() => [...document.querySelectorAll(".dashboard-kpi, .dashboard-metrics > div, .dashboard-section, .performance-list li")].every(el => el.scrollWidth <= el.clientWidth + 2))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const chart = page.locator(".dashboard-line-chart");
    await chart.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tooltip")).toContainText("Nov 2, 2026");
    await expect(page.getByRole("table", { name: "Daily net sales in PHP" }).locator("..")).toHaveClass("sr-only");
  });
}
