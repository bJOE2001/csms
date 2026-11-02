import { expect, test, type Page } from "@playwright/test";
const shop = "00000000-0000-4000-8000-000000000001",
  product = "00000000-0000-4000-8000-000000000002";
async function mock(
  page: Page,
  fail = false,
  catalog = false,
  longCatalog = false,
) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/pos", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          shop: { id: shop, name: "Common Ground Coffee" },
          user_id: shop,
          founder: true,
          products: [
            {
              id: product,
              name: "Spanish latte",
              price_cents: 14500,
              cost_cents: 5000,
              active: true,
            },
            ...(longCatalog
              ? Array.from({ length: 12 }, (_, index) => ({
                  id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
                  name: `Seasonal item ${index + 1}`,
                  price_cents: 10000,
                  cost_cents: 3000,
                  active: true,
                }))
              : []),
            ...(catalog
              ? [
                  {
                    id: "00000000-0000-4000-8000-000000000003",
                    name: "Americano · Hot · 12 oz",
                    price_cents: 11000,
                    cost_cents: 3500,
                    active: true,
                  },
                  {
                    id: "00000000-0000-4000-8000-000000000004",
                    name: "Cappuccino",
                    price_cents: 13500,
                    cost_cents: 4500,
                    active: true,
                  },
                  {
                    id: "00000000-0000-4000-8000-000000000005",
                    name: "Matcha latte",
                    price_cents: 15500,
                    cost_cents: 5500,
                    active: true,
                  },
                  {
                    id: "00000000-0000-4000-8000-000000000006",
                    name: "Butter croissant",
                    price_cents: 9500,
                    cost_cents: 4000,
                    active: true,
                  },
                  {
                    id: "00000000-0000-4000-8000-000000000007",
                    name: "Chocolate cookie",
                    price_cents: 6500,
                    cost_cents: null,
                    active: false,
                  },
                ]
              : []),
          ],
        },
      });
    const body = route.request().postDataJSON();
    requests.push(body);
    if (fail) {
      fail = false;
      return route.abort();
    }
    return route.fulfill({
      json: {
        data: {
          id: body.data.id,
          total_cents:
            body.data.items?.reduce(
              (n: number, i: { quantity: number }) => n + i.quantity * 14500,
              0,
            ) ?? 0,
        },
      },
    });
  });
  return requests;
}
test("cash checkout validates the amount and records quantities", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/pos");
  await page.getByRole("button", { name: /Spanish latte.*145/ }).click();
  await page.getByRole("button", { name: "Increase Spanish latte" }).click();
  await page.getByLabel("Cash received").fill("100");
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(page.locator(".form-message.error")).toContainText(
    "cover the total",
  );
  expect(calls).toHaveLength(0);
  await page.getByLabel("Cash received").fill("400");
  await expect(page.getByText("Change ₱110.00")).toBeVisible();
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Sale complete");
  expect(calls).toHaveLength(1);
});
test("a lost response retains the same sale ID across reload and retry", async ({
  page,
}) => {
  const calls = await mock(page, true);
  await page.goto("/pos");
  await page.getByRole("button", { name: /Spanish latte.*145/ }).click();
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry saved sale" }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Retry saved sale" }).click();
  await expect(page.getByRole("status")).toContainText("Sale complete");
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
});
test("wallet checkout stays in POS and product editing lives in Menu", async ({
  page,
}) => {
  const calls = await mock(page);
  await page.goto("/pos");
  await page.getByRole("button", { name: /Spanish latte.*145/ }).click();
  await page.getByRole("button", { name: "GCash", exact: true }).click();
  await expect(
    page.getByText(/Check that the wallet payment arrived/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  expect(calls[0]).toMatchObject({ data: { method: "gcash" } });
  await expect(
    page.getByRole("button", { name: "Add product", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Spanish latte", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Spanish latte", exact: true })
    .click();
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
    "Spanish latte",
  );
  await page.getByLabel("Selling price (PHP)").fill("150");
  await expect(page.getByLabel("Cost per item (PHP)")).toHaveValue("50.00");
  await page.getByLabel("Cost per item (PHP)").fill("55.25");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls[1]).toMatchObject({
    action: "product",
    data: { price_cents: 15000, cost_cents: 5525 },
  });
});
test("POS fits desktop, tablet, phone and landscape", async ({
  page,
}, info) => {
  await mock(page, false, true);
  for (const size of [
    { width: 1920, height: 1000 },
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/pos");
    await page.getByRole("button", { name: /Spanish latte.*145/ }).click();
    await page.evaluate(() => document.fonts.ready);
    if (size.width >= 1440) {
      expect(
        await page
          .locator(".product-card")
          .first()
          .evaluate((el) => el.getBoundingClientRect().height),
      ).toBeLessThan(200);
      expect(
        await page.evaluate(() => document.fonts.check("14px Manrope")),
      ).toBe(true);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const bounds = await page.locator(".workspace-shell").boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.y).toBe(0);
    expect(bounds?.width).toBe(size.width);
    if (size.width > 760) {
      expect(bounds?.height).toBe(size.height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
    }
    await expect(
      page.getByRole("navigation", { name: "Shop" }).getByRole("link"),
    ).toHaveCount(3);
    if (size.width === 375) {
      await page.getByRole("link", { name: /View order/ }).click();
      await expect(page.locator("#current-order")).toBeInViewport();
      // Capture the starting layout rather than the shortcut's scrolled sticky state.
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({
      path: info.outputPath(`pos-${size.width}.png`),
      fullPage: true,
    });
  }
});

test("desktop menu and order items scroll without moving navigation or checkout", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await mock(page, false, true, true);
  await page.goto("/pos");
  const menu = page.getByRole("region", { name: "Product menu", exact: true });
  await expect(menu).toBeVisible();
  const sidebar = await page.locator(".workspace-sidebar").boundingBox();
  const order = await page.locator("#current-order").boundingBox();
  await menu.hover();
  await page.mouse.wheel(0, 650);
  await expect
    .poll(() => menu.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.locator(".workspace-sidebar").boundingBox()).toEqual(
    sidebar,
  );
  expect(await page.locator("#current-order").boundingBox()).toEqual(order);
  await expect(
    page.getByRole("button", { name: "Complete sale", exact: true }),
  ).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  for (const name of [
    "Spanish latte",
    "Americano",
    "Cappuccino",
    "Matcha latte",
    "Butter croissant",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`${name}.*Add to order`) })
      .click();
  }
  const items = page.locator(".cart-body");
  await items.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => items.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await expect(page.getByLabel("Cash received")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Complete sale", exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: info.outputPath("pos-fullscreen.png"),
    animations: "disabled",
  });
  for (const size of [
    { width: 1280, height: 540 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "Complete sale", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`pos-short-${size.width}.png`),
      animations: "disabled",
    });
  }
});

test("menu search, unavailable products and keyboard entry remain usable", async ({
  page,
}) => {
  await mock(page, false, true);
  await page.goto("/pos");
  await expect(
    page.getByRole("heading", { name: "Product menu", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#workspace-main")).toBeFocused();
  await expect(
    page.getByRole("button", { name: /Chocolate cookie.*Add to order/ }),
  ).toBeDisabled();
  await page.getByLabel("Search products").fill("not on the menu");
  await expect(
    page.getByText("No products match", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Spanish latte.*145/ }),
  ).toBeVisible();
});
