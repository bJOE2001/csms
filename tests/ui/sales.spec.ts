import { test, expect } from "@playwright/test";
test("sales shows revenue, receipt, date filters and a refund confirmation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales");
  await expect(
    page.getByRole("heading", { name: "Sales", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".crud-summary")).toContainText("145.00");
  await expect(page.locator(".crud-summary")).toContainText("95.00");
  await expect(page.locator(".crud-summary")).toContainText("75.00");
  await expect(page.locator(".crud-summary")).toContainText(
    "Gross margin · 65.5%",
  );
  await expect(page.locator(".crud-summary")).toContainText(
    "Net margin · 51.7%",
  );
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(
    "2026-11-02",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 812, height: 375 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`profit-${size.width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByRole("dialog")).toContainText("Latte");
  await page.getByRole("button", { name: "Refund sale", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("desktop Sales fills the viewport and scrolls independently of the sidebar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/?sales");
  const content = page.locator("#workspace-main");
  const sidebar = await page.locator(".workspace-sidebar").boundingBox();
  await content.hover();
  await page.mouse.wheel(0, 800);
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.locator(".workspace-sidebar").boundingBox()).toEqual(
    sidebar,
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.getByRole("button", { name: "View receipt" }),
  ).toBeInViewport();
});

test("date shortcuts navigate to explicit shop periods and custom inputs stay unapplied until submitted", async ({
  page,
}) => {
  await page.goto("/?sales");
  const shortcuts = page.getByRole("navigation", {
    name: "Sales date shortcuts",
  });
  for (const [label, period, from, to] of [
    ["Yesterday", "yesterday", "2026-11-01", "2026-11-01"],
    ["This week", "week", "2026-11-02", "2026-11-02"],
    ["This month", "month", "2026-11-01", "2026-11-02"],
    ["Today", "today", "2026-11-02", "2026-11-02"],
  ]) {
    await shortcuts.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`period=${period}`));
    await expect(shortcuts.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(
      shortcuts.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "true");
    await expect(page.getByLabel("From", { exact: true })).toHaveValue(from);
    await expect(page.getByLabel("To", { exact: true })).toHaveValue(to);
    await expect(page.getByLabel("Applied reporting period")).toContainText(
      label,
    );
  }
  await page.getByLabel("From", { exact: true }).fill("2026-09-01");
  await page.getByLabel("To", { exact: true }).fill("2026-09-30");
  await expect(page.getByLabel("Applied reporting period")).toContainText(
    "Today",
  );
  await page.getByRole("button", { name: "Apply dates", exact: true }).click();
  await expect(page).toHaveURL(/from=2026-09-01&to=2026-09-30/);
  await expect(page.getByLabel("Applied reporting period")).toContainText(
    "Custom dates",
  );
  await expect(shortcuts.locator('[aria-current="true"]')).toHaveCount(0);
  await page.goto("/?sales&missing");
  await expect(page.locator(".crud-summary")).toContainText(
    "Gross margin · Unavailable",
  );
  await expect(page.locator(".crud-summary")).toContainText(
    "Net margin · Unavailable",
  );
});

test("owner can record the missing cost of a refunded receipt and retry a failed save", async ({
  page,
}, info) => {
  const calls: unknown[] = [];
  await page.route("**/api/pos", async (route) => {
    calls.push(route.request().postDataJSON());
    if (calls.length === 1)
      return route.fulfill({
        status: 503,
        json: { error: "Connection interrupted. Retry the same entry." },
      });
    return route.fulfill({ json: { data: null } });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales&missing&refunded");
  await page.getByRole("button", { name: "View receipt" }).click();
  await page
    .getByRole("button", { name: "Record missing cost", exact: true })
    .click();
  const form = page.getByRole("dialog", {
    name: "Record missing cost",
    exact: true,
  });
  await form.getByLabel("Total preparation cost (PHP)").fill("35.25");
  await form.getByLabel("Cost source / note").fill("Ingredient record");
  await page.screenshot({
    path: info.outputPath("record-cost-mobile.png"),
    fullPage: true,
  });
  await form
    .getByRole("button", { name: "Save preparation cost", exact: true })
    .click();
  await expect(form.getByRole("alert")).toContainText("Connection interrupted");
  await expect(form.getByLabel("Total preparation cost (PHP)")).toHaveValue(
    "35.25",
  );
  await form
    .getByRole("button", { name: "Save preparation cost", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]).toMatchObject({
    action: "record_cost",
    data: {
      id: "00000000-0000-4000-8000-000000000002",
      cost_cents: 3525,
      note: "Ingredient record",
    },
  });
  await page.goto("/?sales&missing&staff");
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(
    page.getByRole("button", { name: "Record missing cost", exact: true }),
  ).toHaveCount(0);
});

test("expenses can be recorded and voided; missing costs prevent misleading profit", async ({
  page,
}) => {
  const calls: unknown[] = [];
  await page.route("**/api/pos", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: { data: {} } });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Expense date").fill("2026-11-02");
  await page.getByLabel("Description", { exact: true }).fill("Rent");
  await page.getByLabel("Amount (PHP)").fill("100.25");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls[0]).toMatchObject({
    action: "expense",
    data: { description: "Rent", spent_on: "2026-11-02", amount_cents: 10025 },
  });
  await page.getByRole("button", { name: "Void expense Electricity" }).click();
  await page.getByRole("button", { name: "Confirm void", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(calls[1]).toMatchObject({ action: "void_expense" });
  await page.goto("/?sales&missing");
  await expect(page.locator(".crud-summary")).toContainText("Incomplete");
  await expect(page.getByText(/Profit is incomplete:/)).toBeVisible();
});
