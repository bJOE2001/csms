import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Expense, Sale } from "../../src/lib/sales/domain";

const folder = ".local/ui-review/tablet-reports";
const baseline = process.env.TABLET_CAPTURE_BASELINE === "1";
const sales: Sale[] = Array.from({ length: 24 }, (_, i): Sale => ({
  id: `${String(i + 1).padStart(8, "0")}-0000-4000-8000-000000000001`,
  created_at: "2026-11-02T10:30:00Z", total_cents: 1205500, total_cost_cents: 400000,
  method: i % 2 ? "gcash" : "cash", status: i === 23 ? "refunded" : "completed", payment_status: i === 23 ? "refunded" : "confirmed",
  tendered_cents: null, refund_reason: null,
  items: [{ name: i % 3 ? "Café Latte" : "Seasonal iced coffee with oat milk and a long historical product name", size_label: "16 oz", quantity: 2, unit_price_cents: 602750, line_total_cents: 1205500 }],
}));
const expenses: Expense[] = Array.from({ length: 24 }, (_, i) => ({
  id: `${String(i + 100).padStart(8, "0")}-0000-4000-8000-000000000001`, spent_on: "2026-11-02",
  description: i ? `Operating expense ${i}` : "Rent, utilities and recurring business costs with a long description for tablet wrapping",
  amount_cents: 1205500 + i * 100, voided: i === 23,
}));
const screens = [
  { name: "dashboard", path: "/dashboard", title: "Dashboard", metrics: ".dashboard-kpi, .dashboard-metrics > div" },
  { name: "sales", path: "/app/sales", title: "Sales", metrics: ".sales-transaction-metrics > div" },
  { name: "expenses", path: "/expenses", title: "Expenses Management", metrics: ".expenses-overview > div" },
];

for (const viewport of [
  { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 960, height: 1440 },
  { width: 1032, height: 1376 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 393, height: 852 },
]) {
  test(`report layouts retain readable values and contained scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(({ sales, expenses }) => {
      sessionStorage.setItem("fixture-sales", JSON.stringify(sales));
      sessionStorage.setItem("fixture-expenses", JSON.stringify(expenses));
    }, { sales, expenses });
    for (const screen of screens) {
      await page.goto(`${screen.path}?from=2026-11-01&to=2026-11-03`);
      await expect(page.getByRole("heading", { name: screen.title, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const values = await page.locator(screen.metrics).evaluateAll(elements => elements.map(element => ({
        label: element.querySelector("dt")!.textContent, value: element.querySelector("dd")!.textContent,
      })));
      const geometry = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height, client: element.clientWidth, scroll: element.scrollWidth };
        };
        return { workspace: box(".workspace-content"), header: box(".sales-header"), heading: box(".sales-heading"), controls: box(".sales-header-actions"),
          metrics: box(".dashboard-metrics"), summary: box(".expenses-overview"), chart: box(".dashboard-section"),
          table: box(".table-scroll"), sidebar: box(".workspace-sidebar"), pageWidth: document.documentElement.scrollWidth };
      });
      mkdirSync(folder, { recursive: true });
      const stem = `${screen.name}-${viewport.width}`;
      writeFileSync(`${folder}/${baseline ? "before" : "after"}-${stem}.json`, JSON.stringify({ values, geometry }, null, 2));
      await page.screenshot({ path: `${folder}/${baseline ? "before" : "after"}-${stem}.png`, animations: "disabled" });
      if (baseline) continue;
      const before = `${folder}/before-${stem}.json`;
      if (existsSync(before)) {
        const saved = JSON.parse(readFileSync(before, "utf8"));
        expect(values).toEqual(saved.values);
        if (viewport.width >= 1280 || (viewport.width < 768 && screen.name !== "dashboard")) expect(geometry).toEqual(saved.geometry);
      }
      expect(geometry.pageWidth).toBe(viewport.width);
      expect(geometry.workspace!.scroll).toBeLessThanOrEqual(geometry.workspace!.client + 1);
      const wrapped = await page.locator(screen.metrics).locator("dd").evaluateAll(elements => elements.filter(element => {
        if (!element.textContent?.includes("₱")) return false;
        const range = document.createRange(); range.selectNodeContents(element);
        const lines = new Set([...range.getClientRects()].map(rect => Math.round(rect.y)));
        return lines.size > 1 || element.scrollWidth > element.clientWidth + 1;
      }).map(element => element.textContent));
      // The tablet refinement preserves the existing mobile card presentation.
      if (viewport.width >= 768) expect(wrapped).toEqual([]);
      if (viewport.width >= 768 && viewport.width < 1280) {
        expect(geometry.controls!.y).toBeGreaterThan(geometry.heading!.y + geometry.heading!.height);
        expect(Math.abs(geometry.controls!.x - geometry.heading!.x)).toBeLessThan(1);
        const fields = await page.locator(".report-filter .date-picker-field").evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y, width: element.getBoundingClientRect().width })));
        expect(Math.abs(fields[0].y - fields[1].y)).toBeLessThan(1);
        expect(Math.abs(fields[0].width - fields[1].width)).toBeLessThan(1);
        if (screen.name === "dashboard") {
          expect(geometry.metrics!.scroll).toBeLessThanOrEqual(geometry.metrics!.client);
          const rows = await page.locator(".dashboard-metrics > div").evaluateAll(elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().y))).size);
          expect(rows).toBe(2);
          if (viewport.height > viewport.width) {
            const chart = (await page.locator(".dashboard-main-analytics > section").first().boundingBox())!;
            const products = (await page.locator(".dashboard-main-analytics > section").last().boundingBox())!;
            expect(products.y).toBeGreaterThanOrEqual(chart.y + chart.height);
          }
        }
        if (screen.name === "expenses") {
          const rows = await page.locator(".expenses-overview > div").evaluateAll(elements => new Set(elements.map(element => Math.round(element.getBoundingClientRect().y))).size);
          expect(rows).toBe(2);
        }
        await page.getByRole("button", { name: "Open From Date calendar", exact: true }).click();
        const calendar = page.getByRole("dialog", { name: "From Date calendar", exact: true });
        await expect(calendar).toBeInViewport();
        const popup = (await calendar.boundingBox())!;
        expect(popup.x).toBeGreaterThanOrEqual(0);
        expect(popup.x + popup.width).toBeLessThanOrEqual(viewport.width);
        await page.keyboard.press("Escape");
        await expect(calendar).toHaveCount(0);
        if (screen.name === "dashboard") {
          await page.locator(".dashboard-line-chart").focus();
          await page.keyboard.press("Home");
          await expect(page.getByRole("tooltip")).toContainText("Nov 1, 2026");
        }
        if (screen.name === "sales") {
          await page.getByRole("searchbox").fill("E-wallet");
          await page.getByRole("button", { name: "Next page", exact: true }).click();
          await expect(page.locator(".table-count")).toContainText("11–12 of 12");
          await page.getByRole("button", { name: /^View receipt / }).first().click();
          const receipt = page.getByRole("dialog", { name: "Sale receipt", exact: true });
          await expect(receipt).toContainText("E-wallet");
          await receipt.getByRole("button", { name: "Close dialog", exact: true }).click();
          await page.getByRole("button", { name: "Export CSV", exact: true }).click();
          const download = page.waitForEvent("download");
          await page.getByRole("button", { name: "Download CSV", exact: true }).click();
          expect((await download).suggestedFilename()).toBe("sip-and-snap-summary-2026-11-01_2026-11-03.csv");
        }
        if (screen.name === "expenses") {
          await page.getByRole("searchbox").fill("Operating");
          await expect(page.locator(".table-count")).toContainText("of 23");
          await page.getByRole("button", { name: "Add Expense", exact: true }).click();
          await expect(page.getByRole("dialog", { name: "Add expense", exact: true })).toBeVisible();
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          await page.getByRole("button", { name: "Edit expense Operating expense 1", exact: true }).click();
          await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Operating expense 1");
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
          await page.getByRole("button", { name: "Delete expense Operating expense 1", exact: true }).click();
          await expect(page.getByRole("alertdialog")).toContainText("Operating expense 1");
          await page.getByRole("button", { name: "Cancel", exact: true }).click();
        }
        await page.getByLabel("From Date", { exact: true }).fill("2026-11-02");
        await expect(page).toHaveURL(/from=2026-11-02&to=2026-11-03/);
        await expect(page.locator(".sales-period:visible")).toContainText("Nov 2 – 3, 2026");
        if (screen.name === "sales") {
          await expect(page.getByRole("searchbox")).toHaveValue("E-wallet");
          await expect(page.locator(".table-count")).toContainText("1–10 of 12");
        }
      }
    }
  });
}
