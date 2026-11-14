import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const shopId = "00000000-0000-4000-8000-000000000801";
const cashierId = "00000000-0000-4000-8000-000000000802";
const productId = "00000000-0000-4000-8000-000000000803";
type SaleRequest = { user_id: string; shop_id: string; data: { id: string; captured_at: string; method: string; items: { product_id: string; quantity: number; price_cents: number }[] } };
type StoredSale = { id: string; scope: string; checkout: SaleRequest["data"]; error?: string };

async function fixture(page: Page) {
  const calls: SaleRequest[] = [];
  const state = { userId: cashierId, authenticated: true, rejectSales: false, loseResponse: false };
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") {
      if (!state.authenticated) return route.fulfill({ status: 401, json: { error: "Sign in again to open POS." } });
      return route.fulfill({ json: {
        shop: { id: shopId, name: "Offline Test Coffee" }, user_id: state.userId, founder: true,
        categories: [], products: [{ id: productId, name: "Offline Latte", price_cents: 14500, cost_cents: 4500, active: true,
          inventory: { regular: { state: "active", max_quantity: 20, cost_cents: 4500 } } }],
      } });
    }
    const body = route.request().postDataJSON() as SaleRequest;
    calls.push(body);
    if (state.rejectSales) return route.fulfill({ status: 422, json: { error: "Price changed. Ask the owner to review this sale." } });
    if (state.loseResponse) { state.loseResponse = false; return route.abort(); }
    return route.fulfill({ json: { data: { id: body.data.id, total_cents: body.data.items.reduce((sum, item) => sum + item.price_cents * item.quantity, 0) } } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/pos");
  await expect(page.getByRole("heading", { name: "Product menu", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.posOfflineReady)).toBe("true");
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  return { calls, state };
}

async function storedSales(page: Page): Promise<StoredSale[]> {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("sip-snap-pos-offline-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("outbox", "readonly");
      const request = tx.objectStore("outbox").getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}

async function cashSale(page: Page, queued: number) {
  await page.getByRole("button", { name: /Offline Latte.*Add to cart/ }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  await expect(page.locator(".pos-sync-status")).toContainText(`${queued} ${queued === 1 ? "sale" : "sales"} waiting to sync`);
  await expect(page.locator(".cart-empty")).toBeVisible();
}

async function switchCashier(page: Page, state: { userId: string }, userId: string) {
  state.userId = userId;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
    const open = indexedDB.open("sip-snap-pos-offline-v1", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction("meta", "readonly").objectStore("meta").get("active");
      request.onsuccess = () => { db.close(); resolve(request.result?.value); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }))).toBe(`${shopId}:${userId}`);
}

test("PWA advertises POS installation and serves worker security/update headers", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ start_url: "/pos", display: "standalone", icons: expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192" }), expect.objectContaining({ sizes: "512x512" }),
  ]) });
  const worker = await request.get("/service-worker.js");
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["content-security-policy"]).toBe("default-src 'self'; script-src 'self'");
});

test("a single online visit supports offline reload, multiple cash sales and exact receipt syncing", async ({ page, context }) => {
  const { calls } = await fixture(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".pos-sync-status")).toContainText("Offline · Cash sales saved on this device");
  await cashSale(page, 1);
  await cashSale(page, 2);
  const queued = await storedSales(page);
  expect(queued).toHaveLength(2);
  expect(new Set(queued.map(sale => sale.id)).size).toBe(2);
  expect(queued.every(sale => sale.checkout.captured_at && sale.checkout.method === "cash")).toBe(true);
  expect(calls).toHaveLength(0);
  await page.reload();
  await expect(page.locator(".pos-sync-status")).toContainText("2 sales waiting to sync");
  await page.getByRole("button", { name: /Offline Latte.*Add to cart/ }).click();
  await expect(page.getByRole("button", { name: "E-wallet", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect.poll(async () => (await storedSales(page)).length).toBe(0);
  expect([...new Set(calls.map(call => call.data.id))].sort()).toEqual(queued.map(sale => sale.id).sort());
  for (const sale of queued) expect(calls.find(call => call.data.id === sale.id)).toMatchObject({
    shop_id: shopId, user_id: cashierId, data: sale.checkout,
  });
  await expect(page.locator(".pos-sync-status")).toContainText("Connected to production");
});

test("a production conflict remains saved, visible and exportable for reconciliation", async ({ page, context }) => {
  const { state } = await fixture(page);
  await context.setOffline(true);
  await cashSale(page, 1);
  const [original] = await storedSales(page);
  state.rejectSales = true;
  await context.setOffline(false);
  const status = page.locator(".pos-sync-status");
  await expect(status.getByText("Sales needing review", { exact: true })).toBeVisible();
  await status.getByText("Sales needing review", { exact: true }).click();
  await expect(status).toContainText("Price changed. Ask the owner to review this sale.");
  await expect(status).toContainText(original.id.slice(0, 8).toUpperCase());
  const downloadPromise = page.waitForEvent("download");
  await status.getByRole("button", { name: "Export unsynced sales", exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported).toMatchObject({ format: "sip-snap-unsynced-sales-v1", shop_id: shopId, user_id: cashierId,
    sales: [expect.objectContaining({ id: original.id, checkout: original.checkout })] });
  expect(await storedSales(page)).toHaveLength(1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".pos-sync-status")).toContainText("1 sale waiting to sync");
});

test("an interrupted sync retries the same receipt instead of creating a replacement", async ({ page, context }) => {
  const { calls, state } = await fixture(page);
  await context.setOffline(true);
  await cashSale(page, 1);
  const [original] = await storedSales(page);
  state.loseResponse = true;
  await context.setOffline(false);
  await expect(page.locator(".pos-sync-status").getByText("Sales needing review", { exact: true })).toBeVisible();
  expect(await storedSales(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect.poll(async () => (await storedSales(page)).length).toBe(0);
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(calls.every(call => call.data.id === original.id && call.data.captured_at === original.checkout.captured_at)).toBe(true);
});

test("expired authentication preserves receipts until the original cashier signs in again", async ({ page, context }) => {
  const { calls, state } = await fixture(page);
  await context.setOffline(true);
  await cashSale(page, 1);
  const [original] = await storedSales(page);
  state.authenticated = false;
  await context.setOffline(false);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator(".workspace-sidebar, .workspace-mobile-header")).toHaveCount(0);
  expect(await storedSales(page)).toHaveLength(1);
  expect(calls).toHaveLength(0);
  state.authenticated = true;
  await page.goto("/pos");
  await expect.poll(async () => (await storedSales(page)).length).toBe(0);
  expect(calls.map(call => call.data.id)).toContain(original.id);
});

test("another cashier cannot see or sync the original cashier's offline receipts", async ({ page, context }) => {
  const { calls, state } = await fixture(page);
  await context.setOffline(true);
  await cashSale(page, 1);
  const [original] = await storedSales(page);
  state.userId = "00000000-0000-4000-8000-000000000804";
  await context.setOffline(false);
  await expect(page.getByRole("button", { name: "Export unsynced sales", exact: true })).toHaveCount(0);
  expect(calls).toHaveLength(0);
  expect((await storedSales(page)).map(sale => sale.id)).toEqual([original.id]);
  state.userId = cashierId;
  await page.reload();
  await expect.poll(async () => (await storedSales(page)).length).toBe(0);
  expect(calls.map(call => call.data.id)).toContain(original.id);
  expect(calls.every(call => call.user_id === cashierId)).toBe(true);
});

test("switching cashiers clears the open cart and restores only that cashier's saved retry", async ({ page }) => {
  const { calls, state } = await fixture(page);
  const otherCashier = "00000000-0000-4000-8000-000000000804";
  const originalKey = `simple-pos:${shopId}:${cashierId}`;
  await page.getByRole("button", { name: /Offline Latte.*Add to cart/ }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("300");
  await switchCashier(page, state, otherCashier);
  await expect(page.locator(".cart-empty")).toBeVisible();
  await expect(page.getByLabel("Cash received", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeDisabled();

  await switchCashier(page, state, cashierId);
  await expect(page.locator(".pos-sync-status")).toContainText("Connected to production");
  await page.getByRole("button", { name: /Offline Latte.*Add to cart/ }).click();
  state.loseResponse = true;
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeEnabled();
  const pending = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), originalKey);
  expect(pending.id).toBe(calls[0].data.id);

  await switchCashier(page, state, otherCashier);
  await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toHaveCount(0);
  await expect(page.locator(".cart-empty")).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).id, originalKey)).toBe(pending.id);
  await switchCashier(page, state, cashierId);
  await page.getByRole("button", { name: "Retry saved sale", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText("Sale completed successfully");
  expect(calls.map(call => call.data.id)).toEqual([pending.id, pending.id]);
  expect(calls.every(call => call.user_id === cashierId)).toBe(true);
});
