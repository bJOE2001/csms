import { expect, test } from "@playwright/test";

test("worker upgrade retires stale development scripts and preserves pending POS storage", async ({ page }) => {
  await page.goto("/offline.html");
  await page.evaluate(async () => {
    const cache = await caches.open("coffee-public-shell-v2");
    await cache.put("/_next/static/chunks/app/app/page.js", new Response("stale development module"));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("csms-pos-v1", 10);
      open.onupgradeneeded = () => { open.result.createObjectStore("orders", { keyPath: "id" }); };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, transaction = db.transaction("orders", "readwrite"); transaction.objectStore("orders").put({ id: "pending-upgrade-fixture", status: "pending" }); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => reject(transaction.error); };
    });
  });
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(async () => navigator.serviceWorker.controller !== null && !(await caches.keys()).includes("coffee-public-shell-v2"));
  expect(await page.evaluate(() => caches.keys())).toContain("coffee-public-shell-v3");
  const pending = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open("csms-pos-v1", 10);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, request = db.transaction("orders").objectStore("orders").get("pending-upgrade-fixture"); request.onsuccess = () => { resolve(request.result.status); db.close(); }; request.onerror = () => reject(request.error); };
  }));
  expect(pending).toBe("pending");
});
