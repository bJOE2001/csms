import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("exports automatically applied dates while invalid drafts and search leave the report unchanged", async ({
  page,
}) => {
  await page.goto("/?sales");
  await page.getByLabel("From Date", { exact: true }).fill("2026-10-01");
  await expect(page).toHaveURL(/from=2026-10-01&to=2026-11-02/);
  await expect(page.getByLabel("From Date", { exact: true })).toHaveValue("2026-10-01");
  await page.getByLabel("To Date", { exact: true }).clear();
  await expect(page.getByRole("alert")).toContainText("Choose both dates");
  await page.getByRole("searchbox").fill("no matches");
  for (const option of [
    "Profit summary",
    "Sales history",
    "Operating expenses",
  ]) {
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Export sales data" });
    await expect(dialog).toContainText("2026-10-01 — 2026-11-02");
    await dialog.getByRole("radio", { name: new RegExp(option) }).check();
    const downloadEvent = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download CSV", exact: true })
      .click();
    // Check transient feedback before waiting for the downloaded file on disk.
    await expect(page.locator("[data-sonner-toast][data-type=success]")).toContainText(
      "Download started",
    );
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(
      /^sip-and-snap-(summary|sales|expenses)-2026-10-01_2026-11-02.csv$/,
    );
    const csv = await readFile((await download.path())!, "utf8");
    expect(csv).toContain("Common Ground Coffee");
    expect(csv).toContain("2026-11-02");
    if (option === "Profit summary")
      expect(csv).toContain('"Net profit","75.00","PHP"');
    if (option === "Sales history")
      expect(csv).toContain('"145.00","145.00","50.00","95.00","Recorded"');
    if (option === "Operating expenses")
      expect(csv).toContain('"Electricity","Active","20.00","20.00"');
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Export CSV", exact: true }),
    ).toBeFocused();
  }
});

test("mobile export shows missing costs and retains choices when preparation fails", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/?sales&missing");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export sales data" });
  await expect(dialog).toContainText("Profit stays blank");
  await expect(
    dialog.getByRole("button", { name: "Download CSV", exact: true }),
  ).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  for (const size of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await expect(
      dialog.getByRole("button", { name: "Download CSV", exact: true }),
    ).toBeInViewport();
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`export-${size.width}.png`),
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await dialog.getByRole("radio", { name: /Sales history/ }).check();
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw Error("Download blocked");
    };
  });
  await dialog
    .getByRole("button", { name: "Download CSV", exact: true })
    .click();
  await expect(page.locator("[data-sonner-toast][data-type=error]")).toContainText(
    "could not be prepared",
  );
  await expect(dialog.getByRole("button", { name: "Download CSV", exact: true })).toBeFocused();
  await expect(
    dialog.getByRole("radio", { name: /Sales history/ }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeFocused();
});
