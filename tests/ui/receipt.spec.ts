import { test, expect } from "@playwright/test";

test("receipt shows branded items, original payment and change across screen sizes", async ({
  page,
}, info) => {
  for (const size of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
    { width: 812, height: 375 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/?receipt&long");
    await page.getByRole("button", { name: "View receipt" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Sale receipt",
      exact: true,
    });
    const receipt = dialog.getByRole("article", { name: "Customer receipt" });
    await expect(
      receipt.getByRole("heading", { name: "Common Ground Coffee" }),
    ).toBeVisible();
    await expect(receipt).toContainText("Nov 2, 2026, 5:18 PM");
    await expect(receipt).toContainText("₱385.00");
    await expect(receipt).toContainText("₱500.00");
    await expect(receipt).toContainText("₱115.00");
    await expect(receipt).toContainText("3 items");
    await expect(receipt).toContainText("Size: 16 oz");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`receipt-${size.width}.png`),
      animations: "disabled",
    });
    await expect(
      dialog.getByRole("button", { name: "Print receipt", exact: true }),
    ).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toBeInViewport();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "View receipt" }),
    ).toBeFocused();
  }
});

test("wallet and unknown cash amounts do not invent tendered cash or change", async ({
  page,
}) => {
  for (const query of ["wallet", "unknown-cash"]) {
    await page.goto(`/?receipt&${query}`);
    await page.getByRole("button", { name: "View receipt" }).click();
    const receipt = page.getByRole("article", { name: "Customer receipt" });
    await expect(
      receipt.getByText("Cash received", { exact: true }),
    ).toHaveCount(0);
    await expect(
      receipt.getByText("Change given", { exact: true }),
    ).toHaveCount(0);
    if (query === "wallet") await expect(receipt).toContainText("GCash");
  }
});

test("printing uses only the selected customer receipt and preserves refund status", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = "true";
    };
  });
  await page.goto("/?receipt&refunded");
  await page.getByRole("button", { name: "View receipt" }).click();
  await page
    .getByRole("button", { name: "Print receipt", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-print-called",
    "true",
  );
  const printed = page.locator("body > .print-receipt");
  await expect(printed).toContainText("Refunded in full");
  await expect(printed).toContainText("Original total");
  await expect(printed).not.toContainText("Preparation cost");
  await expect(printed).not.toContainText("Owner ingredient record");
  await expect(printed).not.toContainText("Wrong order returned");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(printed).toBeVisible();
  expect(await printed.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await printed.screenshot({ path: info.outputPath("receipt-print.png") });
  const pdf = await page.pdf({
    path: info.outputPath("receipt.pdf"),
    width: "80mm",
    height: "210mm",
    printBackground: true,
  });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(printed).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Sale receipt", exact: true }),
  ).toBeVisible();
});
