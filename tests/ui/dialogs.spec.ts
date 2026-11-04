import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test.use({ reducedMotion: "reduce" });
test.beforeEach(() => { mkdirSync(".local/ui-review/dialogs", { recursive: true }); });

async function catalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: uid(1), name: "LOGO Coffee" }, user_id: uid(1), founder: true,
    categories: [{ id: uid(2), name: "Coffee" }],
    products: [{ id: uid(3), name: "Latte", category_id: uid(2), description: "Espresso and steamed milk.",
      price_cents: 12000, cost_cents: 4000, active: true,
      sizes: Array.from({ length: 6 }, (_, i) => ({ id: uid(i + 10), label: `${i + 8} oz`,
        price_cents: 12000 + i * 1000, cost_cents: 4000, active: true, is_default: i === 0 })),
    }],
  } }));
}

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 812, height: 375 },
]) {
  test(`shared dialog sizes, alignment and scroll ownership at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await catalog(page);
    for (const [path, trigger, size, maxWidth] of [
      ["/libraries", "Add category", "sm", 448],
      ["/expenses", "Add Expense", "md", 560],
      ["/menu", "Edit Latte", "lg", 760],
    ] as const) {
      await page.goto(path);
      await page.getByRole("button", { name: trigger, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toHaveAttribute("data-size", size);
      const box = (await dialog.boundingBox())!;
      expect(box.width).toBeLessThanOrEqual(maxWidth);
      expect(box.x).toBeGreaterThanOrEqual(15);
      expect(box.y).toBeGreaterThanOrEqual(15);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 15);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 15);
      const header = dialog.locator(".dialog-heading");
      await expect(header).toHaveCSS("border-bottom-width", "0px");
      const body = dialog.locator(".dialog-body").first();
      const footer = dialog.locator(".dialog-footer").first();
      expect(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.locator("form form").count()).toBe(0);
      const padding = await body.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft));
      const firstField = await body.locator(".field").first().boundingBox();
      expect(Math.abs(firstField!.x - box.x - 1 - padding)).toBeLessThan(2);
      for (const button of await footer.getByRole("button").all()) {
        const bounds = (await button.boundingBox())!;
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.height);
      }
      const headerBefore = await header.boundingBox();
      const footerBefore = await footer.boundingBox();
      await page.screenshot({ path: `.local/ui-review/dialogs/${size}-top-${viewport.width}x${viewport.height}.png` });
      if (size === "lg") {
        expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
        await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await expect(dialog.getByLabel("Available for sale", { exact: true })).toBeVisible();
        await dialog.getByLabel("Size label", { exact: true }).last().focus();
        const focused = (await dialog.getByLabel("Size label", { exact: true }).last().boundingBox())!;
        const bodyBounds = (await body.boundingBox())!;
        expect(focused.y).toBeGreaterThanOrEqual(bodyBounds.y);
        expect(focused.y + focused.height).toBeLessThanOrEqual(bodyBounds.y + bodyBounds.height);
        expect(await header.boundingBox()).toEqual(headerBefore);
        expect(await footer.boundingBox()).toEqual(footerBefore);
      }
      await page.screenshot({ path: `.local/ui-review/dialogs/${size}-${viewport.width}x${viewport.height}.png` });
      await footer.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
  });
}

test("dirty confirmations preserve the original form and focus the safe action across repeated openings", async ({ page }) => {
  await catalog(page);
  await page.goto("/menu");
  await page.getByRole("button", { name: "Edit Latte", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Edit product", exact: true });
  await form.getByLabel("Product name", { exact: true }).fill("Latte with oat milk");
  for (let i = 0; i < 3; i++) {
    await form.getByLabel("Product name", { exact: true }).focus();
    await page.keyboard.press("Escape");
    const prompt = page.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect(prompt.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
    await page.mouse.click(4, 4);
    await expect(prompt).toBeVisible();
    await prompt.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(form.getByLabel("Product name", { exact: true })).toBeFocused();
    await expect(form.getByLabel("Product name", { exact: true })).toHaveValue("Latte with oat milk");
    await expect(form.getByLabel("Size label", { exact: true }).first()).toHaveValue("8 oz");
  }
});

test("destructive confirmations initially focus Cancel and do not submit on outside clicks or Escape", async ({ page }) => {
  let mutations = 0;
  await catalog(page);
  await page.route("**/api/pos", route => {
    if (route.request().method() === "GET") return route.fallback();
    mutations++;
    return route.fulfill({ json: { data: {} } });
  });
  await page.goto("/menu");
  const trigger = page.getByRole("button", { name: "Delete product Latte", exact: true });
  await trigger.click();
  const confirmation = page.getByRole("alertdialog", { name: "Delete Latte?", exact: true });
  await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(confirmation).toBeVisible();
  expect(mutations).toBe(0);
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(mutations).toBe(0);
});

test("validation stays above the fields and a pending save locks every dismissal control", async ({ page }) => {
  await catalog(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/pos", async route => {
    if (route.request().method() === "GET") return route.fallback();
    await hold;
    return route.fulfill({ status: 503, json: { error: "Save interrupted. Retry the same record." } });
  });
  await page.goto("/menu");
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Product name", { exact: true }).fill("New latte");
  await form.getByLabel("Selling price (PHP)", { exact: true }).fill("invalid");
  await form.getByLabel("Cost per item (PHP)", { exact: true }).fill("40");
  await form.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(form.getByRole("alert")).toBeFocused();
  const error = (await form.getByRole("alert").boundingBox())!;
  const header = (await form.locator(".dialog-heading").boundingBox())!;
  expect(error.y).toBeGreaterThanOrEqual(header.y + header.height);
  await form.getByLabel("Selling price (PHP)", { exact: true }).fill("130");
  await form.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(form.getByRole("button", { name: "Close dialog", exact: true })).toBeDisabled();
  await expect(form.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);
  await expect(form).toBeVisible();
  release();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Save interrupted");
  await expect(form.getByLabel("Product name", { exact: true })).toHaveValue("New latte");
});
