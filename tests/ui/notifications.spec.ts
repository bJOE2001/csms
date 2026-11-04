import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const toast = "[data-sonner-toast]";
test.use({ reducedMotion: "reduce" });
test.beforeEach(() => { mkdirSync(".local/ui-review/notifications", { recursive: true }); });

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 390, height: 844 }]) {
  test(`notifications remain top-center, compact and dismissible at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?notifications");
    const heading = await page.getByRole("heading", { name: "Record management" }).boundingBox();
    await page.getByRole("button", { name: "success notification", exact: true }).click();
    await page.mouse.move(0, viewport.height - 1);
    const notice = page.locator(toast);
    await expect(notice).toContainText("supporting details");
    await expect(page.locator("[aria-live=polite] [data-sonner-toast]")).toHaveCount(1);
    const bounds = (await notice.boundingBox())!;
    expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
    expect(bounds.y).toBeGreaterThanOrEqual(12);
    expect(bounds.y).toBeLessThanOrEqual(17);
    expect(bounds.width).toBeLessThanOrEqual(420);
    expect(bounds.x).toBeGreaterThanOrEqual(15);
    expect(await page.getByRole("heading", { name: "Record management" }).boundingBox()).toEqual(heading);
    expect(await notice.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Navigate with notification", exact: true }).click();
    await expect(notice).toBeVisible();
    await expect(page.locator("[data-sonner-toaster]")).toHaveCount(1);
    mkdirSync(".local/ui-review/notifications", { recursive: true });
    await page.screenshot({ path: `.local/ui-review/notifications/success-${viewport.width}.png` });
    await notice.getByRole("button", { name: "Dismiss notification" }).click();
    await expect(notice).toHaveCount(0);
  });
}

test("semantic variants deduplicate, stack at most three visibly and preserve critical failures", async ({ page }) => {
  await page.goto("/?notifications");
  await page.clock.install();
  await page.getByRole("button", { name: "error notification", exact: true }).click();
  await page.getByRole("button", { name: "error notification", exact: true }).click();
  await expect(page.locator(`${toast}[data-type=error]`)).toHaveCount(1);
  await page.mouse.move(0, 800);
  await page.clock.runFor(4000);
  await expect(page.locator(`${toast}[data-type=error]`)).toBeVisible();
  await page.clock.runFor(4000);
  await expect(page.locator(toast)).toHaveCount(0);
  for (const type of ["success", "warning", "info"] as const) {
    await page.getByRole("button", { name: `${type} notification`, exact: true }).click();
    await expect(page.locator(`${toast}[data-type=${type}] [data-icon] svg`)).toBeVisible();
    await page.mouse.move(0, 800);
    await page.clock.runFor(type === "warning" ? 4000 : 2500);
    await expect(page.locator(`${toast}[data-type=${type}]`)).toBeVisible();
    await page.clock.runFor(2500);
    await expect(page.locator(toast)).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Rapid notifications", exact: true }).click();
  await expect(page.locator(`${toast}[data-visible=true]`)).toHaveCount(3);
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(page.locator(toast).filter({ hasText: "Operation 5" })).toHaveCount(0);
  await page.mouse.move(0, 800);
  await page.clock.runFor(5000);
  await expect(page.locator(toast)).toHaveCount(0);
  await page.getByRole("button", { name: "Critical notification", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Critical failure");
  await page.mouse.move(0, 800);
  await page.clock.runFor(30000);
  await expect(page.getByRole("alert")).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(page.locator(toast)).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 390, height: 844 }]) {
  test(`POS checkout feedback floats over the real workspace at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const id = "00000000-0000-4000-8000-000000000001";
    let fail = true;
    const requests: unknown[] = [];
    await page.route("**/api/pos", route => {
      if (route.request().method() === "GET") return route.fulfill({ json: {
        shop: { id, name: "LOGO Coffee" }, user_id: id, founder: true, categories: [],
        products: [{ id, name: "Americano", price_cents: 9500, cost_cents: 2800, active: true, sizes: [] }],
      } });
      requests.push(route.request().postDataJSON());
      return route.fulfill(fail ? { status: 503, json: { error: "Payment service unavailable. Retry the saved sale." } }
        : { json: { data: { total_cents: 9500 } } });
    });
    await page.goto("/pos");
    await page.getByRole("button", { name: /Americano.*Add to cart/ }).click();
    if (viewport.width < 1280) await page.getByRole("button", { name: /^Open cart/ }).click();
    await page.getByRole("button", { name: "Place an order", exact: true }).click();
    await expect(page.locator(`${toast}[data-type=error]`)).toContainText("Payment service unavailable");
    // A previous dismiss must not remove a fast response on the next frame.
    await page.waitForTimeout(250);
    await expect(page.locator(`${toast}[data-type=error]`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeVisible();
    await page.locator(toast).getByRole("button", { name: "Dismiss notification" }).click();
    await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Retry saved sale", exact: true }).click();
    await expect(page.locator(`${toast}[data-type=success]`)).toContainText("Sale completed successfully");
    await page.waitForTimeout(250);
    await expect(page.locator(`${toast}[data-type=success]`)).toBeVisible();
    await expect(page.locator(toast)).toContainText("₱95.00 · Receipt #");
    await expect(page.locator(".form-message.success")).toHaveCount(0);
    expect(requests[0]).toEqual(requests[1]);
    const box = (await page.locator(toast).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
    await page.mouse.move(0, viewport.height - 1);
    await page.screenshot({ path: `.local/ui-review/notifications/pos-${viewport.width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("modal failure feedback stays above the dialog without dismissing it or stealing focus", async ({ page }) => {
  await page.goto("/?notifications");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add product", exact: true });
  await dialog.getByLabel("Product name").fill("Fail");
  await dialog.getByLabel("Price").fill("155");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  const notice = page.locator(`${toast}[data-type=error]`);
  await expect(notice).toContainText("This name could not be saved");
  await dialog.getByLabel("Product name").focus();
  await page.screenshot({ path: ".local/ui-review/notifications/modal-error.png" });
  await notice.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(notice).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Product name")).toBeFocused();
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(notice).toBeVisible();
  await page.keyboard.press("Alt+Shift+KeyD");
  await expect(notice).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Product name").fill("Mocha");
  await dialog.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`${toast}[data-type=success]`)).toContainText("Your record was saved");
  await expect(page.getByRole("button", { name: "Add product", exact: true })).toBeFocused();
});

test("redirected authentication feedback waits for the global toaster and appears once", async ({ page }) => {
  await page.goto("/?notifications&redirect");
  await expect(page.locator(`${toast}[data-type=error]`)).toHaveCount(1);
  await expect(page.locator(toast)).toContainText("Those credentials could not be verified");
});

test("keyboard focus pauses dismissal, Escape restores focus, and success times out", async ({ page }) => {
  await page.goto("/?notifications");
  await page.clock.install();
  const trigger = page.getByRole("button", { name: "success notification", exact: true });
  await trigger.click();
  await page.mouse.move(0, 800);
  await expect(page.locator(toast)).toBeVisible();
  await page.keyboard.press("Alt+KeyT");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Dismiss notification" })).toBeFocused();
  await page.clock.runFor(8000);
  await expect(page.locator(toast)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.clock.runFor(4500);
  await expect(page.locator(toast)).toHaveCount(0);
});

test("an immediate repeat survives a prior timeout or manual dismissal's exit animation", async ({ page }) => {
  await page.goto("/?notifications");
  await page.clock.install();
  const trigger = page.getByRole("button", { name: "info notification", exact: true });
  const visible = page.locator(`${toast}[data-type=info][data-removed=false]`);
  await trigger.click();
  await expect(visible).toHaveCount(1);
  await page.mouse.move(0, 800);
  await page.clock.runFor(4000);
  await trigger.click();
  await page.clock.runFor(350);
  await expect(visible).toHaveCount(1);
  await visible.getByRole("button", { name: "Dismiss notification" }).click();
  await trigger.click();
  await page.clock.runFor(350);
  await expect(visible).toHaveCount(1);
});
