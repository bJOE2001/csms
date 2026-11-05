import { expect, test, type Page } from "@playwright/test";

const shop = "00000000-0000-4000-8000-000000000001";
const product = "00000000-0000-4000-8000-000000000002";
const storageKey = `simple-pos:${shop}:${shop}`;
const catalog = {
  shop: { id: shop, name: "LOGO Coffee" }, user_id: shop, founder: true, categories: [],
  products: [{ id: product, name: "Espresso", active: true, price_cents: 9500, cost_cents: 3000, sizes: [
    { id: "00000000-0000-4000-8000-000000000003", label: "8 oz", active: true, is_default: true, price_cents: 9500, cost_cents: 3000 },
    { id: "00000000-0000-4000-8000-000000000004", label: "16 oz", active: true, is_default: false, price_cents: 13000, cost_cents: 4500 },
  ] }],
};
async function mock(page: Page, hold?: Promise<void>) {
  const calls: { action: string; data: { id: string } }[] = [];
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: catalog });
    calls.push(route.request().postDataJSON());
    if (hold && calls.length === 1) { await hold; return route.abort(); }
    return route.fulfill({ json: { data: { id: calls.at(-1)!.data.id, total_cents: 9500 } } });
  });
  return calls;
}

for (const width of [1440, 1032, 393]) {
  test(`cart removal stays local without a cancellation action at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await mock(page);
    await page.goto("/pos");
    await page.getByRole("button", { name: /Espresso.*Add to cart/ }).click();
    await page.getByRole("radio", { name: "16 oz", exact: true }).check();
    await page.getByRole("button", { name: /Espresso.*Add to cart/ }).click();
    if (width < 1280) await page.getByRole("button", { name: "Open cart, 2 items", exact: true }).click();
    await page.getByRole("button", { name: "E-wallet", exact: true }).click();
    await expect(page.getByRole("button", { name: "E-wallet", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Cancel order", exact: true })).toHaveCount(0);
    await page.screenshot({ path: `.local/ui-review/payments/pos-${width}.png`, animations: "disabled" });
    await page.getByRole("button", { name: "Remove Espresso 8 oz from cart", exact: true }).click();
    await expect(page.locator(".order-line")).toHaveCount(1);
    await expect(page.locator(".pos-total")).toContainText("₱130.00");
    await page.getByRole("button", { name: "Remove Espresso 16 oz from cart", exact: true }).click();
    await expect(page.locator(".cart-empty")).toBeVisible();
    await expect(page.locator(".pos-total")).toContainText("₱0.00");
    await expect(page.getByRole("button", { name: "Place an order", exact: true })).toBeDisabled();
    expect(calls).toHaveLength(0);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
    if (width < 1280) await page.getByRole("button", { name: "Close cart", exact: true }).click();
    await expect(page.getByRole("radio", { name: "16 oz", exact: true })).toBeChecked();
    await expect(page.getByRole("button", { name: /Espresso.*Add to cart/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("saved checkout remains protected and retries with the same sale ID", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const calls = await mock(page, hold);
  await page.goto("/pos");
  await page.getByRole("button", { name: /Espresso.*Add to cart/ }).click();
  await page.getByRole("button", { name: "Place an order", exact: true }).click();
  try {
    await expect.poll(() => calls.length).toBe(1);
    await expect(page.getByRole("button", { name: "Remove Espresso 8 oz from cart", exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).not.toBeNull();
  } finally { release(); }
  await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry saved sale", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Cancel order", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry saved sale", exact: true }).click();
  await expect(page.locator(".cart-empty")).toBeVisible();
  expect(calls).toHaveLength(2);
  expect(calls[1].data.id).toBe(calls[0].data.id);
});

test("Dashboard and Sales count refunds only while retaining historical cancelled receipts", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fixture-sales", JSON.stringify(["completed", "refunded", "cancelled"].map((status, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 5}`, created_at: "2026-11-02T08:00:00Z",
    total_cents: 9500, total_cost_cents: 3000, method: "cash", status, payment_status: status === "completed" ? "confirmed" : status,
    tendered_cents: 10000, refund_reason: null, items: [{ name: "Historical Espresso", quantity: 1, unit_price_cents: 9500, line_total_cents: 9500 }],
  })))));
  for (const path of ["/dashboard", "/app/sales"]) {
    await page.goto(`${path}?from=2026-11-02&to=2026-11-02`);
    const metric = page.locator("dl > div").filter({ has: page.getByText("Refunded Transactions", { exact: true }) });
    await expect(metric.locator("dd")).toHaveText("1");
    await expect(page.getByText(/Reversed (Sales|Transactions)/)).toHaveCount(0);
  }
  await expect(page.locator(".sales-status")).toHaveText(["completed", "refunded", "cancelled"]);
});
