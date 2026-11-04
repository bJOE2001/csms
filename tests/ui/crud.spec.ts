import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Record management" }),
  ).toBeVisible();
});

test("successful CRUD saves close the dialog, announce success and restore focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", {
    name: "Add product",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Add product", exact: true });
  await expect(dialog.getByLabel("Product name")).toBeFocused();
  await dialog.getByLabel("Product name").fill("Mocha");
  await dialog.getByLabel("Price").fill("155");
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText(
    "Your record was saved.",
  );
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel("Product name")).toHaveValue("");
});

test("closing a dirty form asks before discarding and keeps the draft when cancelled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await page.getByLabel("Product name").fill("Mocha");
  await page.keyboard.press("Escape");
  const prompt = page.getByRole("alertdialog", {
    name: "Discard your changes?",
  });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await prompt.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Product name")).toHaveValue("Mocha");
  await expect(page.getByLabel("Product name")).toBeFocused();
  await page.keyboard.press("Escape");
  await prompt.getByRole("button", { name: "Discard changes" }).click();
  await expect(
    page.getByRole("dialog").or(page.getByRole("alertdialog")),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.uiTestCalls)).toEqual([]);
});

test("failed saves preserve entered values and announce failure without moving focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await dialog.getByLabel("Product name").fill("Fail");
  await dialog.getByLabel("Price").fill("155");
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("This name could not be saved");
  await expect.poll(() => dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await expect(dialog.getByLabel("Product name")).toHaveValue("Fail");
  await expect(dialog.getByLabel("Price")).toHaveValue("155");
  await expect(page.locator("[data-sonner-toast][data-type=success]")).toHaveCount(0);
  await dialog.getByLabel("Product name").fill("Mocha");
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(dialog).not.toBeVisible();
});

test("a pending save prevents dismissal and duplicate submissions", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.uiTestDelay = 1500;
  });
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await dialog.getByLabel("Product name").fill("Mocha");
  await dialog.getByLabel("Price").fill("155");
  await dialog.getByRole("button", { name: "Save product" }).click();
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => window.uiTestCalls)).toHaveLength(1);
});

test("consequential actions wait for explicit confirmation", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Hide Latte" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Hide Latte?" });
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => window.uiTestCalls)).toHaveLength(0);
  await page.getByRole("button", { name: "Hide Latte" }).click();
  await dialog.getByRole("button", { name: "Confirm hide" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => window.uiTestCalls)).toEqual([
    { action: "hide" },
  ]);
});

test("record tables search and announce keyboard sorting", async ({ page }) => {
  await page
    .getByRole("searchbox", { name: "Search products" })
    .fill("Americano");
  await expect(
    page.getByRole("table", { name: "Products" }).getByRole("row"),
  ).toHaveCount(2);
  await page.getByRole("searchbox", { name: "Search products" }).fill("");
  await page.getByRole("button", { name: /^Product/ }).click();
  await expect(
    page.getByRole("columnheader", { name: /^Product/ }),
  ).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: /^Product/ }).press("Enter");
  await expect(
    page.getByRole("columnheader", { name: /^Product/ }),
  ).toHaveAttribute("aria-sort", "descending");
});

test("mobile dialogs trap focus and respect reduced motion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add product" });
  await expect(dialog).toHaveCSS("animation-name", "none");
  await dialog.getByRole("button", { name: "Close dialog" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Save product" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close dialog" }),
  ).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(15);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await page.screenshot({
    path: testInfo.outputPath("mobile-dialog.png"),
    fullPage: true,
  });
});
