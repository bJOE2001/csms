import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";
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
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Oat cookie");
  await chooseOption(page, page.getByRole("dialog").getByLabel("Category", { exact: true }), "Food");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Baked in our shop.");
  await page.getByRole("radio", { name: "Image URL", exact: true }).check();
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
    page.getByRole("button", { name: /Oat cookie.*45.50.*Add to cart/ }),
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
    await page.goto("/app/menu");
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
      page.getByRole("group", { name: `Size for Custom drink ${count}`, exact: true }).getByRole("radio", { name: saved.sizes![count - 1].label, exact: true }),
    ).toBeChecked();
  });

test("size validation retains drafts and removing a size chooses a valid default", async ({
  page,
  context,
}) => {
  const state = await catalog(context);
  await page.goto("/app/menu");
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
    page.getByRole("group", { name: "Size for Café Latte", exact: true }).getByRole("radio", { name: "12 oz", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("radio", { name: "22 oz — Unavailable", exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to cart/ })
    .click();
  await page
    .getByRole("button", { name: "Increase Café Latte 12 oz", exact: true })
    .click();
  await page.getByRole("group", { name: "Size for Café Latte", exact: true }).getByRole("radio", { name: "16 oz", exact: true }).check();
  await page
    .getByRole("button", { name: /Café Latte 16 oz.*145.*Add to cart/ })
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
    .getByRole("button", { name: "Place an order", exact: true })
    .click();
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText("Sale completed successfully");
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
    .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to cart/ })
    .click();
  const menu = await context.newPage();
  await menu.goto("/app/menu");
  await menu
    .getByRole("button", { name: "Edit Café Latte", exact: true })
    .click();
  await fillSize(menu, 1, "12 oz", "130", "40");
  await menu.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(menu.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".cart-item-issue")).toContainText("changed");
  await expect(page.locator(".pos-total")).toContainText("120.00");
  await expect(
    page.getByRole("button", { name: "Place an order", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Use 12 oz.*130/ }).click();
  await expect(page.locator(".pos-total")).toContainText("130.00");
  await expect(
    page.getByRole("button", { name: "Place an order", exact: true }),
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
    .getByRole("button", { name: "Remove Café Latte 12 oz from cart", exact: true })
    .click();
  await expect(page.locator(".order-line")).toHaveCount(0);
});

test("category CRUD protects assignments and filters use real records", async ({
  page,
  context,
}) => {
  await catalog(context);
  await page.goto("/libraries");
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
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("button", { name: /Add category|Edit category|Delete category/ })).toHaveCount(0);
  await chooseOption(page, page.getByLabel("Category", { exact: true }), "Coffee");
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(2);
  await expect(page.locator(".menu-products tbody tr").first()).toContainText(
    "Americano",
  );
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await chooseOption(page, page.getByLabel("Availability", { exact: true }), "Unavailable");
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
    await page.goto("/app/menu");
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
    if (width < 1280) await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    await page.getByRole("link", { name: "POS", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Size for Café Latte", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Café Latte 12 oz.*120.*Add to cart/ })
      .click();
    if (width < 1280) await page.getByRole("button", { name: /^Open cart/ }).click();
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
  await page.goto("/app/menu");
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

test("Libraries changes synchronize category records with Menu and POS", async ({ page, context }) => {
  const state = await catalog(context);
  const assignments = state.products.map(product => [product.id, product.category_id]);
  const menu = await context.newPage(), pos = await context.newPage();
  await menu.goto("/app/menu");
  await pos.goto("/pos");
  await page.goto("/libraries");
  await expect(page.getByRole("link", { name: "Libraries", exact: true })).toHaveAttribute("aria-current", "page");
  const coffee = page.getByRole("row").filter({ hasText: "Coffee" });
  await expect(coffee.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  expect(await page.getByLabel("Category name", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(state.calls).toHaveLength(0);
  await page.getByLabel("Category name", { exact: true }).fill("Seasonal");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(pos.getByRole("button", { name: "Seasonal", exact: true })).toBeVisible();
  await menu.getByRole("button", { name: "Add product", exact: true }).click();
  const category = menu.getByRole("dialog").getByRole("combobox", { name: "Category", exact: true });
  await category.click();
  await expect(menu.getByRole("option", { name: "Seasonal", exact: true })).toBeVisible();
  await menu.keyboard.press("Escape");
  await menu.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "Edit category Coffee", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Coffee Bar");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(pos.getByRole("button", { name: "Coffee Bar", exact: true })).toBeVisible();
  await expect(menu.getByRole("cell", { name: "Coffee Bar", exact: true })).toHaveCount(2);
  await chooseOption(menu, menu.getByRole("combobox", { name: "Category", exact: true }), "Coffee Bar");
  await expect(menu.locator(".menu-products tbody tr")).toHaveCount(2);
  await pos.getByRole("button", { name: "Coffee Bar", exact: true }).click();
  await expect(pos.locator(".product-card")).toHaveCount(2);
  expect(state.products.map(product => [product.id, product.category_id])).toEqual(assignments);

  await page.getByRole("button", { name: "Delete category Seasonal", exact: true }).click();
  await page.getByRole("button", { name: "Delete category", exact: true }).click();
  await expect(pos.getByRole("button", { name: "Seasonal", exact: true })).toHaveCount(0);
  await expect(menu.locator(".menu-overview")).toContainText("Total Categories2");
  expect(state.categories.map(category => category.name)).toEqual(["Coffee Bar", "Food"]);
  expect(state.products.map(product => [product.id, product.category_id])).toEqual(assignments);
});

test("Libraries retains category drafts and shows server deletion protection", async ({ page, context }) => {
  const state = await catalog(context);
  state.categories.push({ id: uid(90), name: "Unused" });
  const failedSaves: unknown[] = [];
  await context.route("**/api/pos", route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    if (body.action === "category" && !failedSaves.length) {
      failedSaves.push(body.data);
      return route.fulfill({ status: 503, json: { error: "Category could not be saved. Retry." } });
    }
    if (body.action === "delete_category")
      return route.fulfill({ status: 409, json: { error: "Reassign products in this category before deleting it" } });
    return route.fallback();
  });
  await page.goto("/libraries");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Seasonal");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Category could not be saved");
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue("Seasonal");
  await page.getByRole("button", { name: "Save category", exact: true }).click();
  expect(state.calls.at(-1)!.data).toEqual(failedSaves[0]);
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue("");
  await page.getByLabel("Category name", { exact: true }).fill("Discard this draft");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete category Unused", exact: true }).click();
  await page.getByRole("button", { name: "Delete category", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Reassign products");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(state.categories.some(category => category.id === uid(90))).toBe(true);
});

test("Libraries shows member read-only access, empty data and loading retry", async ({ page, context }) => {
  const state = await catalog(context, false);
  let failed = false;
  await context.route("**/api/pos", route => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { error: "Categories are temporarily unavailable." } });
    }
    return route.fallback();
  });
  await page.goto("/libraries");
  await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table", { name: "Product categories", exact: true })).toBeVisible();
  await expect(page.getByText("You can view categories. An owner manages category records.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add category|Edit category|Delete category/ })).toHaveCount(0);
  state.categories.splice(0);
  state.products.forEach(product => { product.category_id = undefined; });
  await page.reload();
  await expect(page.getByText("No categories yet. Add your first category to organize your menu.")).toBeVisible();
});

test("Libraries layout fits responsive viewports", async ({ page, context }, info) => {
  const state = await catalog(context);
  state.categories.push({ id: uid(91), name: "A category with a longer name that should wrap on small screens".slice(0, 60) });
  await page.goto("/libraries");
  for (const viewport of [
    { width: 1440, height: 900 }, { width: 1024, height: 768 },
    { width: 768, height: 1024 }, { width: 375, height: 812 }, { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("heading", { name: "Product Categories", exact: true })).toBeVisible();
    if (viewport.width >= 1280) {
      await expect(page.getByRole("navigation", { name: "Shop" }).getByRole("link")).toHaveCount(6);
      await expect(page.getByRole("link", { name: "Libraries", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Shop" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Open navigation menu", exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const header = page.locator(".libraries-workspace > header");
    await expect(header).toHaveCSS("border-bottom-width", "0px");
    if (viewport.width >= 1024) {
      const heading = await page.locator(".libraries-section-heading").boundingBox();
      const action = await page.getByRole("button", { name: "Add category", exact: true }).boundingBox();
      expect(Math.abs(heading!.y + heading!.height / 2 - action!.y - action!.height / 2)).toBeLessThan(2);
    }
    await page.screenshot({ path: info.outputPath(`libraries-${viewport.width}.png`), fullPage: true });
  }
  await page.getByRole("searchbox", { name: "Search category name" }).fill("Coffee");
  await expect(page.locator(".libraries-categories tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(page.getByLabel("Category name", { exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath("libraries-category-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Add category", exact: true })).toBeFocused();
});
