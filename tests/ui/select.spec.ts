import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const catalog = {
  shop: { id: uid(1), name: "Common Ground Coffee" }, user_id: uid(1), founder: true,
  categories: [{ id: uid(2), name: "Coffee" }, { id: uid(3), name: "Food" }],
  products: [
    { id: uid(4), name: "Latte", price_cents: 12000, cost_cents: 4000, active: true, category_id: uid(2), sizes: [
      { id: uid(5), label: "12 oz", price_cents: 12000, cost_cents: 4000, active: true, is_default: true },
      { id: uid(6), label: "16 oz", price_cents: 14500, cost_cents: 5000, active: true, is_default: false },
      { id: uid(7), label: "22 oz", price_cents: 17000, cost_cents: 6000, active: false, is_default: false },
    ] },
    { id: uid(8), name: "Cookie", price_cents: 6000, cost_cents: 2000, active: false, category_id: uid(3) },
    { id: uid(9), name: "Water", price_cents: 2000, cost_cents: 500, active: true },
  ],
};
async function mockCatalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: catalog }));
}
test.beforeEach(async ({ page }) => page.emulateMedia({ reducedMotion: "reduce" }));

test("select keyboard navigation skips disabled options, supports typeahead and restores focus", async ({ page }) => {
  await page.goto("/?selects");
  const trigger = page.getByRole("combobox", { name: "Category", exact: true });
  await trigger.focus();
  await trigger.press("Space");
  const selected = page.getByRole("option", { name: "Uncategorized", exact: true });
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Coffee", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Category 1 with a longer descriptive label", exact: true })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(selected).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Category 30 with a longer descriptive label", exact: true })).toBeFocused();
  await page.keyboard.type("Coffee");
  await expect(page.getByRole("option", { name: "Coffee", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Coffee");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveCSS("outline-width", "2px");
  await expect(trigger).toHaveCSS("box-shadow", "none");
  await expect(page.getByRole("combobox", { name: "Disabled selection" })).toBeDisabled();
});

test("uncontrolled select submits original values, clears to empty and resets normally", async ({ page }) => {
  await page.goto("/?selects");
  const trigger = page.getByRole("combobox", { name: "Category", exact: true });
  const output = page.getByLabel("Submitted category");
  await chooseOption(page, trigger, "Coffee");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(output).toHaveText("coffee");
  await chooseOption(page, trigger, "Uncategorized");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(output).toHaveText("(empty)");
  await chooseOption(page, trigger, "Coffee");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(trigger).toContainText("Uncategorized");
  expect(await page.locator("form").evaluate(form => new FormData(form as HTMLFormElement).get("category"))).toBe("");
});

test("Menu category and availability selects keep existing filtering behavior", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/?menu");
  await chooseOption(page, page.getByRole("combobox", { name: "Category", exact: true }), "Food");
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(1);
  await expect(page.locator(".menu-products tbody tr")).toContainText("Cookie");
  await chooseOption(page, page.getByRole("combobox", { name: "Availability", exact: true }), "Available");
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(3);
  await chooseOption(page, page.getByRole("combobox", { name: "Category", exact: true }), "Uncategorized");
  await expect(page.locator(".menu-products tbody tr")).toContainText("Water");
});

test("POS inline sizes update prices, disable unavailable sizes and retain separate cart lines", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/?pos");
  const sizes = page.getByRole("group", { name: "Size for Latte", exact: true });
  await page.getByRole("button", { name: /Latte 12 oz.*120.*Add to cart/ }).click();
  await expect(sizes.getByRole("radio", { name: "22 oz — Unavailable", exact: true })).toBeDisabled();
  await sizes.getByRole("radio", { name: "16 oz", exact: true }).check();
  await page.getByRole("button", { name: /Latte 16 oz.*145.*Add to cart/ }).click();
  await expect(page.locator(".pos-total")).toContainText("₱265.00");
  await expect(page.locator(".order-line")).toHaveCount(2);
});

test("category selects inside dialogs preserve drafts on failed saves and empty values on retry", async ({ page }) => {
  const calls: { data: { category_id: string | null } }[] = [];
  await page.route("**/api/pos", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: catalog });
    calls.push(route.request().postDataJSON());
    return route.fulfill(calls.length === 1
      ? { status: 503, json: { error: "Save interrupted. Retry." } }
      : { json: { data: calls.at(-1)!.data } });
  });
  await page.goto("/?menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name", { exact: true }).fill("Oat drink");
  await page.getByLabel("Selling price (PHP)", { exact: true }).fill("120");
  await page.getByLabel("Cost per item (PHP)", { exact: true }).fill("40");
  const trigger = page.getByRole("dialog").getByRole("combobox", { name: "Category", exact: true });
  await chooseOption(page, trigger, "Coffee");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Save interrupted");
  await expect(trigger).toContainText("Coffee");
  await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("Oat drink");
  await chooseOption(page, trigger, "Uncategorized");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls.map(call => call.data.category_id)).toEqual([uid(2), null]);
});

test("select-only edits mark dialogs dirty; Escape closes the select before the dialog", async ({ page }) => {
  await mockCatalog(page);
  await page.goto("/?menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const trigger = page.getByRole("dialog").getByRole("combobox", { name: "Category", exact: true });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add product", exact: true })).toBeVisible();
  await chooseOption(page, trigger, "Coffee");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog", { name: "Discard your changes?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(trigger).toContainText("Coffee");
});

test("select popups scroll and stay inside desktop, tablet, phone and landscape viewports", async ({ page }, info) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?selects");
    const trigger = page.getByRole("combobox", { name: "Category", exact: true });
    await expect(trigger).toHaveCSS("height", "44px");
    await trigger.click();
    const listbox = page.getByRole("listbox");
    const bounds = await listbox.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(11);
    expect(bounds!.y).toBeGreaterThanOrEqual(11);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 11);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 11);
    expect(await page.locator(".select-viewport").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await page.keyboard.press("End");
    await expect(page.getByRole("option", { name: "Category 30 with a longer descriptive label", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`select-${viewport.width}.png`) });
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("product category menus portal above dialogs and respect small viewport edges", async ({ page }, info) => {
  await mockCatalog(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?menu");
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    const trigger = page.getByRole("dialog").getByRole("combobox", { name: "Category", exact: true });
    await trigger.click();
    const listbox = page.getByRole("listbox");
    const bounds = await listbox.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(11);
    expect(bounds!.y).toBeGreaterThanOrEqual(11);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width - 11);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 11);
    expect(await listbox.evaluate(element => element.closest('[role="dialog"]'))).toBeNull();
    await page.screenshot({ path: info.outputPath(`select-dialog-${viewport.width}.png`) });
    await expect(listbox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("touch selection updates POS size prices and Menu filters", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await mockCatalog(page);
  await page.goto("/?pos");
  await page.getByRole("group", { name: "Size for Latte", exact: true }).getByRole("radio", { name: "16 oz", exact: true }).tap();
  await expect(page.getByRole("button", { name: /Latte 16 oz.*145.*Add to cart/ })).toBeEnabled();
  await page.goto("/?menu");
  await page.getByRole("combobox", { name: "Category", exact: true }).tap();
  await page.getByRole("option", { name: "Coffee", exact: true }).tap();
  await expect(page.locator(".menu-products tbody tr")).toHaveCount(1);
  await expect(page.locator(".menu-products tbody tr")).toContainText("Latte");
  await context.close();
});
