import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { Product, Category } from "../../src/lib/menu/domain";
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function catalog(context: BrowserContext, founder = true) {
  const products: Product[] = [
    {
      id: uid(10),
      name: "Café Latte",
      description: "Espresso with steamed milk.",
      price_cents: 12000,
      cost_cents: 4000,
      category_id: uid(2),
      active: true,
      sizes: [
        {
          id: uid(11),
          label: "12 oz",
          price_cents: 12000,
          cost_cents: 4000,
          active: true,
          is_default: true,
        },
        {
          id: uid(12),
          label: "16 oz",
          price_cents: 14500,
          cost_cents: 5000,
          active: true,
          is_default: false,
        },
        {
          id: uid(13),
          label: "22 oz",
          price_cents: 17000,
          cost_cents: 6000,
          active: false,
          is_default: false,
        },
      ],
    },
    {
      id: uid(20),
      name: "Americano",
      price_cents: 11000,
      cost_cents: 3500,
      category_id: uid(2),
      active: true,
    },
    {
      id: uid(21),
      name: "Butter croissant",
      price_cents: 9500,
      cost_cents: 4000,
      category_id: uid(3),
      active: true,
    },
    {
      id: uid(22),
      name: "Chocolate cookie",
      price_cents: 6500,
      cost_cents: null,
      category_id: uid(3),
      active: false,
    },
  ];
  const categories: Category[] = [
    { id: uid(2), name: "Coffee" },
    { id: uid(3), name: "Food" },
  ];
  const calls: { action: string; data: Record<string, unknown> }[] = [];
  await context.route("**/api/pos", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          shop: { id: uid(1), name: "Common Ground Coffee" },
          user_id: uid(1),
          founder,
          products: products.filter((product) => !product.archived_at),
          categories,
        },
      });
    const body = route.request().postDataJSON();
    calls.push(body);
    if (body.action === "product") {
      const index = products.findIndex(
        (product) => product.id === body.data.id,
      );
      if (index < 0) products.push(body.data);
      else products[index] = body.data;
    } else if (body.action === "category") {
      const index = categories.findIndex(
        (category) => category.id === body.data.id,
      );
      if (index < 0) categories.push(body.data);
      else categories[index] = body.data;
    } else if (body.action === "archive_product") {
      products.find((product) => product.id === body.data.id)!.archived_at =
        "2026-11-02T10:00:00Z";
    } else if (body.action === "delete_category")
      categories.splice(
        categories.findIndex((category) => category.id === body.data.id),
        1,
      );
    await route.fulfill({
      json: {
        data:
          body.action === "checkout"
            ? {
                id: body.data.id,
                total_cents: body.data.items.reduce(
                  (
                    sum: number,
                    item: { quantity: number; price_cents: number },
                  ) => sum + item.quantity * item.price_cents,
                  0,
                ),
              }
            : body.data,
      },
    });
  });
  return { products, categories, calls };
}
async function fillSize(
  page: Page,
  number: number,
  label: string,
  price: string,
  cost: string,
) {
  const row = page.getByRole("group", { name: `Size ${number}`, exact: true });
  await row.getByLabel("Size label", { exact: true }).fill(label);
  await row.getByLabel("Price (PHP)", { exact: true }).fill(price);
  await row.getByLabel("Cost (PHP)", { exact: true }).fill(cost);
}

test("Menu creates a regular product and synchronizes it to POS", async ({
  page,
  context,
}) => {
  const state = await catalog(context);
  await page.goto("/menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Oat cookie");
  await page
    .getByRole("dialog")
    .getByLabel("Category", { exact: true })
    .selectOption(uid(3));
  await page
    .getByLabel("Description", { exact: true })
    .fill("Baked in our shop.");
  await page
    .getByLabel("Product image URL", { exact: false })
    .fill("/icons/coffee.svg");
  await page.getByLabel("Selling price (PHP)", { exact: true }).fill("45.50");
  await page.getByLabel("Cost per item (PHP)", { exact: true }).fill("18.25");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    state.products.find((product) => product.name === "Oat cookie"),
  ).toMatchObject({
    price_cents: 4550,
    cost_cents: 1825,
    category_id: uid(3),
    image_url: "/icons/coffee.svg",
    sizes: [],
  });
  await page.getByRole("link", { name: "POS", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Oat cookie.*45.50.*Add to order/ }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Add product", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});

for (const count of [1, 3])
  test(`Menu saves ${count} custom sizes with a valid default`, async ({
    page,
    context,
  }) => {
    const state = await catalog(context);
    await page.goto("/menu");
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    await page
      .getByLabel("Product name", { exact: true })
      .fill(`Custom drink ${count}`);
    for (let index = 1; index <= count; index++) {
      await page.getByRole("button", { name: "Add size", exact: true }).click();
      await fillSize(
        page,
        index,
        `${index * 8} oz`,
        String(100 + index * 10),
        String(30 + index * 5),
      );
    }
    await page
      .getByRole("group", { name: `Size ${count}`, exact: true })
      .getByLabel("Default", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Save product", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = state.products.find(
      (product) => product.name === `Custom drink ${count}`,
    )!;
    expect(saved.sizes).toHaveLength(count);
    expect(
      saved.sizes?.filter((size) => size.is_default).map((size) => size.label),
    ).toEqual([`${count * 8} oz`]);
    await page.getByRole("link", { name: "POS", exact: true }).click();
    await expect(
      page.getByLabel(`Size for Custom drink ${count}`, { exact: true }),
    ).toHaveValue(saved.sizes![count - 1].id);
  });

test("size validation retains drafts and removing a size chooses a valid default", async ({
  page,
  context,
}) => {
  const state = await catalog(context);
  await page.goto("/menu");
  await page
    .getByRole("button", { name: "Edit Café Latte", exact: true })
    .click();
  await fillSize(page, 2, " 12 OZ ", "145", "50");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(
    page.getByText("Size labels must be unique within a product."),
  ).toBeVisible();
  expect(state.calls).toHaveLength(0);
  await fillSize(page, 2, "16 oz", "1.001", "50");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Size 2", exact: true })
      .getByText(/valid PHP amount/),
  ).toBeVisible();
  expect(state.calls).toHaveLength(0);
  await fillSize(page, 2, "16 oz", "145.50", "50");
  await page
    .getByRole("button", { name: "Remove size 12 oz", exact: true })
    .click();
  await expect(
    page
      .getByRole("group", { name: "Size 1", exact: true })
      .getByLabel("Default", { exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.products[0].sizes?.map((size) => size.label)).toEqual([
    "16 oz",
    "22 oz",
  ]);
  expect(state.products[0].price_cents).toBe(14550);
});

test("POS keeps selected sizes separate and sends their exact checkout prices", async ({
  page,
  context,
}) => {
  const state = await catalog(context);
  await page.goto("/pos");
  await expect(
    page.getByLabel("Size for Café Latte", { exact: true }),
  ).toHaveValue(uid(11));
  await expect(
    page
      .getByLabel("Size for Café Latte", { exact: true })
      .locator(`option[value="${uid(13)}"]`),
  ).toHaveJSProperty("disabled", true);
  await page
    .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to order/ })
    .click();
  await page
    .getByRole("button", { name: /Café Latte 12 oz.*120.*Add another/ })
    .click();
  await page
    .getByLabel("Size for Café Latte", { exact: true })
    .selectOption(uid(12));
  await page
    .getByRole("button", { name: /Café Latte 16 oz.*145.*Add to order/ })
    .click();
  await expect(page.locator(".order-line")).toHaveCount(2);
  await expect(page.locator(".pos-total")).toContainText("385.00");
  await page
    .getByRole("button", { name: "Increase Café Latte 16 oz", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Decrease Café Latte 12 oz", exact: true })
    .click();
  await expect(page.locator(".pos-total")).toContainText("410.00");
  await page.getByLabel("Cash received", { exact: true }).fill("500");
  await expect(page.getByText("Change ₱90.00", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Complete sale", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Sale complete");
  expect(state.calls[0].data.items).toEqual([
    {
      product_id: uid(10),
      size_id: uid(11),
      size_label: "12 oz",
      quantity: 1,
      price_cents: 12000,
    },
    {
      product_id: uid(10),
      size_id: uid(12),
      size_label: "16 oz",
      quantity: 2,
      price_cents: 14500,
    },
  ]);
});

test("menu changes in another tab require cart review and preserve the old price", async ({
  page,
  context,
}) => {
  await catalog(context);
  await page.goto("/pos");
  await page
    .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to order/ })
    .click();
  const menu = await context.newPage();
  await menu.goto("/menu");
  await menu
    .getByRole("button", { name: "Edit Café Latte", exact: true })
    .click();
  await fillSize(menu, 1, "12 oz", "130", "40");
  await menu.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(menu.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cart-item-issue")).toContainText("changed");
  await expect(page.locator(".pos-total")).toContainText("120.00");
  await expect(
    page.getByRole("button", { name: "Complete sale", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Use 12 oz.*130/ }).click();
  await expect(page.locator(".pos-total")).toContainText("130.00");
  await expect(
    page.getByRole("button", { name: "Complete sale", exact: true }),
  ).toBeEnabled();
  await menu
    .getByRole("button", { name: "Edit Café Latte", exact: true })
    .click();
  await menu
    .getByRole("button", { name: "Remove size 12 oz", exact: true })
    .click();
  await menu.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.locator(".cart-item-issue")).toContainText(
    "no longer available",
  );
  await page
    .getByRole("button", { name: "Remove Café Latte 12 oz", exact: true })
    .click();
  await expect(page.locator(".order-line")).toHaveCount(0);
});

test("category CRUD protects assignments and filters/sorting use real records", async ({
  page,
  context,
}) => {
  await catalog(context);
  await page.goto("/menu");
  await page
    .getByRole("button", { name: "Delete category Coffee", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toContainText("Reassign");
  await expect(
    page.getByRole("button", { name: "Delete category", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Seasonal");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit category Seasonal", exact: true })
    .click();
  await page.getByLabel("Category name", { exact: true }).fill("Specials");
  await page
    .getByRole("button", { name: "Save category", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete category Specials", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit category Specials", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Category", { exact: true }).selectOption(uid(2));
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(2);
  await page
    .getByLabel("Sort products", { exact: true })
    .selectOption("price_desc");
  await expect(page.locator(".menu-products tbody tr").first()).toContainText(
    "Café Latte",
  );
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByLabel("Availability", { exact: true })
    .selectOption("unavailable");
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(1);
  await expect(page.locator(".menu-products tbody tr")).toContainText(
    "Chocolate cookie",
  );
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await page
    .getByLabel("Search product name", { exact: true })
    .fill("Americano");
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete product Americano", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete product", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Americano", exact: true }),
  ).toHaveCount(0);
});

test("Menu and size forms fit desktop tablet and phone; members have read-only access", async ({
  page,
  context,
}, info) => {
  await catalog(context);
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
    await page.goto("/menu");
    await expect(
      page.getByRole("heading", { name: "Menu Management", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 375) {
      const table = page.locator(".menu-products .table-scroll");
      expect(
        await table.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await expect(
        page
          .locator(".menu-products tbody td[data-label=Size]")
          .filter({ hasText: "22 oz" }),
      ).toBeVisible();
      await expect(
        page
          .locator(".menu-products tbody td[data-label=Availability]")
          .first(),
      ).toBeVisible();
    }
    await page.screenshot({
      path: info.outputPath(`menu-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Edit Café Latte", exact: true })
      .click();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(dialog!.x).toBeGreaterThanOrEqual(0);
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`sizes-${width}.png`),
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.getByRole("link", { name: "POS", exact: true }).click();
    await expect(
      page.getByLabel("Size for Café Latte", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to order/ })
      .click();
    await expect(page.locator(".order-line")).toContainText("Size: 12 oz");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`sized-pos-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});

test("staff can view Menu without management actions", async ({
  page,
  context,
}) => {
  await catalog(context, false);
  await page.goto("/menu");
  await expect(
    page.getByRole("heading", { name: "Menu Management", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("An owner manages products", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add product", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
});
