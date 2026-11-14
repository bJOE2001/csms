import { expect, test } from "@playwright/test";

for (const path of ["/pos", "/app/menu", "/libraries"]) {
  test(`${path} returns to login when the open session expires`, async ({ page }) => {
    let signedIn = true;
    const shopId = "00000000-0000-4000-8000-000000000001";
    await page.route("**/api/pos", route => signedIn
      ? route.fulfill({ json: { shop: { id: shopId, name: "Session test" }, user_id: shopId, founder: true, products: [], categories: [] } })
      : route.fulfill({ status: 401, json: { error: "Sign in to open POS." } }));
    // This component fixture isolates session-expiry handling from the server guard.
    await page.route("**/login", route => route.fulfill({ contentType: "text/html", body: "<main><h1>Sign in</h1></main>" }));
    await page.goto(path);
    await expect(page.locator(".workspace-sidebar")).toBeVisible();
    await expect(page.locator(".workspace-skeleton")).toHaveCount(0);
    const pendingKey = `simple-pos:${shopId}:${shopId}`;
    await page.evaluate(key => localStorage.setItem(key, "saved receipt"), pendingKey);
    signedIn = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".workspace-sidebar, .workspace-mobile-header")).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBe("saved receipt");
  });
}
