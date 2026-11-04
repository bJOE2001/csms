import { expect, test, type Locator, type Page } from "@playwright/test";

async function openCalendar(page: Page, label: string) {
  await page.getByRole("button", { name: `Open ${label} calendar`, exact: true }).click();
  const calendar = page.getByRole("dialog", { name: `${label} calendar`, exact: true });
  await expect(calendar.getByRole("grid")).toBeVisible();
  return calendar;
}
function day(calendar: Locator, date: string) {
  return calendar.locator(`[data-day="${date}"] button`);
}
async function chooseNavigation(calendar: Locator, page: Page, label: string, value: string) {
  await calendar.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: value, exact: true }).click();
}
async function popupFits(page: Page, calendar: Locator) {
  const viewport = page.viewportSize()!;
  await expect.poll(async () => {
    const box = (await calendar.boundingBox())!;
    return box.x >= 11 && box.y >= 11 && box.x + box.width <= viewport.width - 11 && box.y + box.height <= viewport.height - 11;
  }).toBe(true);
  expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test("date filters select both endpoints, highlight their range and keep ISO report values", async ({ page }, info) => {
  await page.goto("/app/sales");
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue("Nov 2, 2026");
  expect(await page.locator('input[type="date"]').count()).toBe(0);
  let calendar = await openCalendar(page, "From Date");
  await day(calendar, "2026-11-01").click();
  await expect(calendar).toHaveCount(0);
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02/);
  calendar = await openCalendar(page, "To Date");
  await day(calendar, "2026-11-04").click();
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-04/);
  await expect(page.locator('input[name="from"]')).toHaveValue("2026-11-01");
  await expect(page.locator('input[name="to"]')).toHaveValue("2026-11-04");
  calendar = await openCalendar(page, "To Date");
  await expect(day(calendar, "2026-11-01")).toHaveCSS("background-color", "rgb(59, 27, 18)");
  await expect(day(calendar, "2026-11-04")).toHaveCSS("background-color", "rgb(59, 27, 18)");
  await expect(calendar.locator('[data-day="2026-11-02"]')).toHaveCSS("background-color", "rgb(255, 228, 198)");
  await expect(calendar).toHaveCSS("border-color", "rgb(232, 222, 214)");
  await expect(calendar.locator(".calendar-range-summary")).toHaveText("Nov 1, 2026 – Nov 4, 2026");
  await expect(calendar.getByRole("button", { name: "Today", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("range-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open To Date calendar", exact: true })).toBeFocused();
});

test("valid typing applies automatically while invalid, incomplete and oversized ranges keep the existing report", async ({ page }) => {
  await page.goto("/app/sales?from=2026-11-02&to=2026-11-02&keep=1");
  const from = page.getByLabel("From Date", { exact: true });
  const to = page.getByLabel("To Date", { exact: true });
  await expect(page.getByRole("button", { name: "Apply Dates", exact: true })).toHaveCount(0);
  await from.fill("Nov 1, 2026");
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02&keep=1/);
  await to.fill("Oct 31, 2026");
  await expect(page.getByRole("alert")).toContainText("To Date must be on or after From Date");
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02&keep=1/);
  await to.clear();
  await expect(page.getByRole("alert")).toContainText("Choose both dates");
  await to.fill("2026-02-30");
  await expect(page.getByRole("alert")).toContainText("Choose valid dates");
  await to.fill("2027-11-03");
  await expect(page.getByRole("alert")).toContainText("up to one year");
  // Invalid drafts cannot reach the URL or change reporting/export props.
  await page.waitForTimeout(450);
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02&keep=1/);
  await from.fill('not-a-date" ]');
  const calendar = await openCalendar(page, "From Date");
  await expect(calendar.getByRole("grid")).toBeVisible();
});

test("historical month/year navigation, previous/next controls and disabled end dates stay usable", async ({ page }) => {
  await page.goto("/app/sales?from=2024-02-01&to=2024-02-29");
  const calendar = await openCalendar(page, "To Date");
  await expect(calendar.getByRole("grid")).toHaveAttribute("aria-label", "February 2024");
  await calendar.getByRole("button", { name: "Go to the Previous Month" }).click();
  await expect(calendar.getByRole("grid")).toHaveAttribute("aria-label", "January 2024");
  await expect(day(calendar, "2024-01-20")).toBeDisabled();
  await calendar.getByRole("button", { name: "Go to the Next Month" }).click();
  await chooseNavigation(calendar, page, "Choose the Year", "2023");
  await expect(calendar.getByRole("grid")).toHaveAttribute("aria-label", "February 2023");
  await chooseNavigation(calendar, page, "Choose the Year", "2024");
  await chooseNavigation(calendar, page, "Choose the Month", "March");
  await expect(calendar.getByRole("grid")).toHaveAttribute("aria-label", "March 2024");
  await day(calendar, "2024-03-01").click();
  await expect(page).toHaveURL(/from=2024-02-01&to=2024-03-01/);
  await expect(page.getByLabel("To Date", { exact: true })).toHaveValue("Mar 1, 2024");
});

test("keyboard entry, day navigation, Escape and nested month-select focus are preserved", async ({ page }) => {
  await page.goto("/app/sales");
  const from = page.getByLabel("From Date", { exact: true });
  await from.focus();
  await page.keyboard.press("Alt+ArrowDown");
  const calendar = page.getByRole("dialog", { name: "From Date calendar", exact: true });
  await expect(day(calendar, "2026-11-02")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(day(calendar, "2026-11-01")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(calendar).toHaveCount(0);
  await expect(from).toBeFocused();
  await expect(page).toHaveURL(/from=2026-11-01&to=2026-11-02/);
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("PageUp");
  await expect(calendar.getByRole("grid")).toHaveAttribute("aria-label", "October 2026");
  await page.keyboard.press("Escape");
  await expect(from).toBeFocused();
  await page.getByRole("button", { name: "Open From Date calendar", exact: true }).click();
  await calendar.getByRole("combobox", { name: "Choose the Year" }).click();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("combobox", { name: "Choose the Year" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 },
  { width: 390, height: 844 }, { width: 320, height: 640 }, { width: 812, height: 375 },
]) {
  test(`calendars fit reporting headers and expense dialogs at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    for (const path of ["/app/sales", "/expenses"]) {
      await page.goto(path);
      for (const label of ["From Date", "To Date"]) {
        const calendar = await openCalendar(page, label);
        await popupFits(page, calendar);
        const geometry = await calendar.locator(".calendar-weekday").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x + element.getBoundingClientRect().width / 2));
        const centers = await calendar.locator(".calendar-grid tbody tr").first().locator("td").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x + element.getBoundingClientRect().width / 2));
        expect(centers).toEqual(geometry);
        const buttons = await calendar.locator(".calendar-day-button").all();
        for (const button of buttons) {
          const bounds = (await button.boundingBox())!;
          expect(bounds.height).toBe(44);
          expect(bounds.width).toBeGreaterThanOrEqual(viewport.width >= 390 ? 44 : 36);
        }
        await page.screenshot({ path: info.outputPath(`${path.includes("sales") ? "sales" : "expenses"}-${label}-${viewport.width}.png`) });
        await page.keyboard.press("Escape");
      }
    }
    await page.getByRole("button", { name: "Add Expense", exact: true }).click();
    const form = page.getByRole("dialog", { name: "Add expense", exact: true });
    const calendar = await openCalendar(page, "Expense date");
    await popupFits(page, calendar);
    expect(await calendar.evaluate(element => !!element.closest(".app-dialog"))).toBe(false);
    await day(calendar, "2026-11-01").click();
    await expect(form.getByLabel("Expense date", { exact: true })).toHaveValue("Nov 1, 2026");
    await expect(form.locator('input[name="spent_on"]')).toHaveValue("2026-11-01");
    await page.screenshot({ path: info.outputPath(`expense-dialog-${viewport.width}.png`) });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog", { name: "Discard your changes?" })).toBeVisible();
  });
}

for (const timezoneId of ["Asia/Manila", "America/Los_Angeles", "Pacific/Kiritimati"]) {
  test(`calendar dates remain in Manila when the browser uses ${timezoneId}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId, baseURL: "http://127.0.0.1:3017" });
    const page = await context.newPage();
    try {
      // Playwright's Date constructor replacement erases TZDate subclasses.
      // Freeze the instant read by TZDate without changing Date inheritance.
      await page.addInitScript(timestamp => { Date.now = () => timestamp; }, new Date("2026-11-03T16:30:00Z").getTime());
      await page.goto("/app/sales");
      const calendar = await openCalendar(page, "To Date");
      await expect(calendar.locator('[data-day="2026-11-04"]')).toHaveAttribute("data-today", "true");
      await day(calendar, "2026-11-04").click();
      await expect(page).toHaveURL(/from=2026-11-02&to=2026-11-04/);
      await expect(page.getByLabel("To Date", { exact: true })).toHaveValue("Nov 4, 2026");
      await expect(page.locator('input[name="to"]')).toHaveValue("2026-11-04");
    } finally { await context.close(); }
  });
}

test("expense calendar changes survive failures, submit ISO dates and reset after discarding", async ({ page }) => {
  const calls: { action: string; data: { spent_on: string; id: string } }[] = [];
  await page.route("**/api/pos", route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    return calls.length === 1 ? route.fulfill({ status: 503, json: { error: "Connection interrupted. Retry the same entry." } }) : route.fulfill({ json: { data: body.data } });
  });
  await page.goto("/expenses");
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add expense", exact: true });
  const calendar = await openCalendar(page, "Expense date");
  await day(calendar, "2026-11-01").click();
  await form.getByLabel("Description", { exact: true }).fill("Coffee shop rent");
  await form.getByLabel("Amount (PHP)").fill("100.25");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText("Connection interrupted");
  await expect(form.getByLabel("Expense date", { exact: true })).toHaveValue("Nov 1, 2026");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(form).toHaveCount(0);
  expect(calls[0].data.spent_on).toBe("2026-11-01");
  expect(calls[1]).toEqual(calls[0]);
  await page.getByRole("button", { name: "Add Expense", exact: true }).click();
  await expect(form.getByLabel("Expense date", { exact: true })).toHaveValue("Nov 2, 2026");
  await form.getByLabel("Expense date", { exact: true }).fill("Feb 30, 2026");
  await form.getByLabel("Description", { exact: true }).fill("Invalid entry");
  await form.getByLabel("Amount (PHP)").fill("10");
  await form.getByRole("button", { name: "Save expense", exact: true }).click();
  expect(calls).toHaveLength(2);
  expect(await form.getByLabel("Expense date", { exact: true }).evaluate((input: HTMLInputElement) => input.validity.customError)).toBe(true);
});

test("touch interaction selects dates without requiring hover", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 768, height: 1024 }, baseURL: "http://127.0.0.1:3017" });
  const page = await context.newPage();
  try {
    await page.goto("/expenses");
    await page.getByRole("button", { name: "Open To Date calendar", exact: true }).tap();
    const calendar = page.getByRole("dialog", { name: "To Date calendar", exact: true });
    await day(calendar, "2026-11-04").tap();
    await expect(page).toHaveURL(/from=2026-11-02&to=2026-11-04/);
    await expect(page.getByLabel("To Date", { exact: true })).toHaveValue("Nov 4, 2026");
  } finally { await context.close(); }
});
