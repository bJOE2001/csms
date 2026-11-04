import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const id = "00000000-0000-4000-8000-000000000001";
const catalog = (name = "LOGO Coffee") => ({ shop: { id, name }, user_id: id, founder: true, categories: [],
  products: [{ id, name: "Latte", price_cents: 12000, cost_cents: 4000, active: true, sizes: [] }] });
const bar = (page: Page) => page.locator(".global-loading-bar");
test.beforeEach(() => { mkdirSync(".local/ui-review/loading", { recursive: true }); });

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test(`initial POS loading keeps branding and the workspace at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    let release!: () => void;
    const wait = new Promise<void>(done => { release = done; });
    await page.route("**/api/pos", async route => { await wait; await route.fulfill({ json: catalog() }); });
    await page.goto("/pos");
    await expect(bar(page)).toHaveAttribute("data-busy", "true");
    await expect(page.locator(".workspace-shell")).toHaveCount(1);
    await expect(page.locator(".product-skeleton")).toHaveCount(6);
    await expect(page.getByRole("heading", { name: "Open POS" })).toHaveCount(0);
    await expect(page.getByText("No products yet.", { exact: false })).toHaveCount(0);
    const header = page.locator(viewport.width >= 1280 ? ".workspace-sidebar" : ".workspace-mobile-header");
    await expect(header).toBeVisible();
    await header.evaluate(el => { el.setAttribute("data-preserved", "yes"); });
    const bounds = (await bar(page).boundingBox())!;
    expect(bounds).toMatchObject({ x: 0, y: 0, width: viewport.width, height: 3 });
    await expect(bar(page)).toHaveCSS("pointer-events", "none");
    await expect(bar(page)).toHaveCSS("opacity", "1");
    await expect(bar(page).locator(".global-loading-segment")).toHaveCSS("background-color", "rgb(242, 161, 94)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // Freeze a visible phase of the real indeterminate animation for visual QA.
    await bar(page).locator(".global-loading-segment").evaluate(el => {
      for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = 600; }
    });
    await page.screenshot({ path: `.local/ui-review/loading/pos-${viewport.width}.png` });
    release();
    await expect(page.getByRole("article", { name: "Latte", exact: true })).toBeVisible();
    await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
    await expect(bar(page)).toHaveAttribute("data-busy", "false");
    await expect(bar(page)).toHaveCSS("opacity", "0");
    await expect(header).toHaveAttribute("data-preserved", "yes");
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  });
}

for (const path of ["/pos", "/menu", "/libraries"]) {
  test(`${path} stops loading on failure, retains navigation and retries to a genuine empty result`, async ({ page }) => {
    let fail = true;
    let release!: () => void;
    const wait = new Promise<void>(done => { release = done; });
    await page.route("**/api/pos", async route => {
      if (fail) { await wait; return route.fulfill({ status: 503, json: { error: "Catalog unavailable. Retry." } }); }
      await route.fulfill({ json: { ...catalog(), products: [] } });
    });
    await page.goto(path);
    await expect(bar(page)).toHaveAttribute("data-busy", "true");
    await expect(page.locator(".workspace-sidebar")).toBeVisible();
    await expect(page.locator(".table-empty")).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/loading/${path.slice(1)}-initial.png` });
    release();
    await expect(page.getByRole("alert")).toContainText("Catalog unavailable");
    await expect(bar(page)).toHaveAttribute("data-busy", "false");
    fail = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.locator(path === "/pos" ? ".empty-state" : ".table-empty")).toBeVisible();
    await expect(bar(page)).toHaveAttribute("data-busy", "false");
  });
}

test("background refresh retains the order, cash, products and header on failure", async ({ page }) => {
  let gets = 0, release!: () => void;
  const wait = new Promise<void>(done => { release = done; });
  await page.route("**/api/pos", async route => {
    gets++;
    if (gets === 2) { await wait; return route.fulfill({ status: 503, json: { error: "Refresh interrupted" } }); }
    await route.fulfill({ json: catalog() });
  });
  await page.goto("/pos");
  await page.getByRole("button", { name: /Latte.*Add to cart/ }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("200");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(bar(page)).toHaveAttribute("data-busy", "true");
  await expect(page.locator(".pos-total")).toContainText("₱120.00");
  await expect(page.getByLabel("Cash received", { exact: true })).toHaveValue("200");
  await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
  release();
  await expect(page.getByRole("alert")).toContainText("Refresh interrupted");
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  await expect(page.locator(".pos-total")).toContainText("₱120.00");
  expect(gets).toBe(2);
});

test("checkout uses its local processing state without starting a global data indicator", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>(done => { release = done; });
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: catalog() });
    await wait;
    await route.fulfill({ status: 503, json: { error: "Payment unavailable. Retry the saved sale." } });
  });
  await page.goto("/pos");
  await page.getByRole("button", { name: /Latte.*Add to cart/ }).click();
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  await expect(page.locator(".checkout-button").or(page.getByRole("button", { name: "Saving sale…", exact: true }))).toHaveAttribute("aria-busy", "true");
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  release();
  await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeVisible();
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
});

test("overlapping scopes finish independently, are idempotent, and clean up on unmount", async ({ page }) => {
  await page.goto("/?loading");
  await page.getByRole("button", { name: "Start first", exact: true }).click();
  await page.getByRole("button", { name: "Start second", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "true");
  await page.getByRole("button", { name: "Finish first twice", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "true");
  await page.getByRole("button", { name: "Finish second", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  await page.getByRole("button", { name: "Toggle scope", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "true");
  await page.getByRole("button", { name: "Toggle scope", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  await page.getByRole("button", { name: "Start transition", exact: true }).click();
  await page.getByRole("button", { name: "Unmount action", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "true");
  await page.getByRole("button", { name: "Complete transition", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
});

test("superseded and unmounted catalog requests cannot overwrite current data or strand the bar", async ({ page }) => {
  const releases: (() => void)[] = [];
  await page.route("**/api/pos", async route => {
    const index = releases.length;
    await new Promise<void>(done => { releases.push(done); });
    await route.fulfill({ json: catalog(`Result ${index}`) });
  });
  await page.goto("/?loading");
  await page.getByRole("button", { name: "Toggle catalog", exact: true }).click();
  await expect.poll(() => releases.length).toBe(1);
  await page.getByRole("button", { name: "Refresh catalog", exact: true }).click();
  await expect.poll(() => releases.length).toBe(2);
  releases[1]();
  await expect(page.getByLabel("Catalog probe")).toContainText("Result 1");
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  releases[0]();
  await expect(page.getByLabel("Catalog probe")).not.toContainText("Result 0");
  await page.getByRole("button", { name: "Refresh catalog", exact: true }).click();
  await expect.poll(() => releases.length).toBe(3);
  await page.getByRole("button", { name: "Toggle catalog", exact: true }).click();
  await expect(bar(page)).toHaveAttribute("data-busy", "false");
  releases[2]();
});

test("reduced motion presents a static, indeterminate status without percentages", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?loading");
  await page.getByRole("button", { name: "Start first", exact: true }).click();
  await expect(bar(page)).toContainText("Loading workspace…");
  await expect(bar(page).locator(".global-loading-segment")).toHaveCSS("animation-name", "none");
  const width = await bar(page).locator(".global-loading-segment").evaluate(el => el.getBoundingClientRect().width);
  expect(width).toBe(await page.evaluate(() => innerWidth));
  await expect(bar(page)).not.toHaveAttribute("aria-valuenow");
});
