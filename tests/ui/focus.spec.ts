import { expect, test, type Locator, type Page } from "@playwright/test";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function catalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: uid(1), name: "Common Ground Coffee" }, user_id: uid(1), founder: true,
    categories: [{ id: uid(2), name: "Coffee" }],
    products: [{
      id: uid(3), name: "Latte", price_cents: 12000, cost_cents: 4000,
      active: true, category_id: uid(2), sizes: [
        { id: uid(4), label: "12 oz", price_cents: 12000, cost_cents: 4000, active: true, is_default: true },
        { id: uid(5), label: "16 oz", price_cents: 14500, cost_cents: 5000, active: true, is_default: false },
      ],
    }],
  } }));
}

async function singleFocus(page: Page, field: Locator, owner = field, error = false) {
  await field.click({ trial: true });
  await page.evaluate(() => document.fonts.ready);
  await field.evaluate((element: HTMLElement) => element.blur());
  const geometry = () => field.evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, padding: style.padding, radius: style.borderRadius, font: style.font };
  });
  const initial = await geometry();
  const isSelect = await field.evaluate(element => element.tagName === "SELECT" || element.getAttribute("role") === "combobox");
  await field.click();
  if (isSelect) {
    await page.keyboard.press("Escape");
    await expect(field).toBeFocused();
  }
  // A real keyboard traversal must retain the same single indicator as pointer focus.
  await field.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  await expect(owner).toHaveCSS("outline-style", "solid");
  await expect(owner).toHaveCSS("outline-width", "2px");
  await expect(owner).toHaveCSS("outline-offset", "-1px");
  await expect(owner).toHaveCSS("box-shadow", "none");
  await expect(field).toHaveCSS("box-shadow", "none");
  expect(await geometry()).toEqual(initial);
  const color = await owner.evaluate((element, invalid) => {
    const style = getComputedStyle(element);
    const probe = document.createElement("span");
    probe.style.color = style.getPropertyValue(invalid ? "--danger" : "--focus");
    document.body.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return { actual: style.outlineColor, expected };
  }, error);
  expect(color.actual).toBe(color.expected);
  if (error) await expect(owner).toHaveCSS("border-color", color.expected);
  if (owner !== field) {
    await expect(field).toHaveCSS("border-width", "0px");
    await expect(field).toHaveCSS("outline-width", "0px");
  }
  // Catch another visible focus outline on any surrounding wrapper.
  expect(await owner.evaluate(element => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const s = getComputedStyle(ancestor);
      if (s.outlineStyle !== "none" && s.outlineColor !== "rgba(0, 0, 0, 0)" && Number.parseFloat(s.outlineWidth)) return false;
    }
    return true;
  })).toBe(true);
}

for (const width of [1440, 375]) {
  test(`single focus: POS and Menu controls at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await catalog(page);
    await page.goto("/?pos");
    const search = page.getByRole("searchbox", { name: "Search products" });
    await singleFocus(page, search, page.locator(".pos-search"));
    await search.fill("Latte");
    const sizes = page.getByRole("group", { name: "Size for Latte", exact: true });
    const size = sizes.getByRole("radio", { name: "12 oz", exact: true });
    await size.focus();
    await expect(size.locator("..")).toHaveCSS("outline-width", "2px");
    await expect(size).toHaveCSS("outline-width", "0px");
    await sizes.getByRole("radio", { name: "16 oz", exact: true }).check();
    await page.getByRole("button", { name: /Latte 16 oz.*Add to cart/ }).click();
    if (width < 1280) await page.getByRole("button", { name: /^Open cart/ }).click();
    await expect(page.locator(".pos-total")).toContainText("₱145.00");
    await singleFocus(page, page.getByLabel("Cash received", { exact: true }));
    await page.screenshot({ path: info.outputPath(`focus-pos-${width}.png`), fullPage: true });

    await page.goto("/?menu");
    const menuSearch = page.getByRole("searchbox", { name: "Search product name" });
    await singleFocus(page, menuSearch, page.locator(".table-search"));
    await singleFocus(page, page.getByRole("combobox", { name: "Category", exact: true }));
    await singleFocus(page, page.getByRole("combobox", { name: "Availability", exact: true }));
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    await singleFocus(page, page.getByLabel("Product name", { exact: true }));
    await singleFocus(page, page.getByRole("combobox", { name: "Category", exact: true }));
    await singleFocus(page, page.getByLabel("Description", { exact: true }));
    await page.screenshot({ path: info.outputPath(`focus-menu-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`single focus: Sales and Expenses dates, search and forms at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/app/sales", "/expenses"]) {
      await page.goto(path);
      const date = page.getByLabel("From Date", { exact: true });
      await singleFocus(page, date);
      expect(await date.evaluate((input: HTMLInputElement) => typeof input.showPicker)).toBe("function");
      const search = page.getByRole("searchbox");
      await singleFocus(page, search, page.locator(".table-search"));
      await search.fill("no match");
      await expect(page.getByText("No matching records. Try a different search.")).toBeVisible();
      const end = page.getByLabel("To Date", { exact: true });
      await end.fill("2026-11-01");
      await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
      await singleFocus(page, end, end, true);
      await page.screenshot({ path: info.outputPath(`focus-${path.includes("sales") ? "sales" : "expenses"}-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Add Expense", exact: true }).click();
    await singleFocus(page, page.getByLabel("Expense date", { exact: true }));
    await singleFocus(page, page.getByLabel("Description", { exact: true }));
    await singleFocus(page, page.getByLabel("Amount (PHP)", { exact: true }));
    await page.screenshot({ path: info.outputPath(`focus-expense-form-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("single focus: native fields, number, read-only and disabled controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await singleFocus(page, page.getByLabel("Product name", { exact: true }));
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  const required = page.getByLabel("Product name", { exact: true });
  expect(await required.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await singleFocus(page, required, required, true);
  expect(await page.evaluate(() => window.uiTestCalls)).toEqual([]);
  await page.goto("/?controls");
  const number = page.getByRole("spinbutton", { name: "Number" });
  await singleFocus(page, number);
  await number.press("ArrowUp");
  await expect(number).toHaveValue("3");
  const readOnly = page.getByLabel("Read-only", { exact: true });
  await singleFocus(page, readOnly);
  await readOnly.press("A");
  await expect(readOnly).toHaveValue("Receipt total");
  await expect(page.getByLabel("Disabled", { exact: true })).toBeDisabled();
});
