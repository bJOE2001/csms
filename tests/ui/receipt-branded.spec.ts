import { expect, test } from "@playwright/test";
import { chooseOption } from "../helpers/select";

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`branded receipt keeps one usable scroller at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?receipt&long");
    await page.getByRole("button", { name: "View receipt" }).click();
    const dialog = page.getByRole("dialog", { name: "Sale receipt", exact: true });
    const logo = dialog.getByRole("img", { name: "LOGO Coffee", exact: true });
    await expect(logo).toHaveAttribute("src", "/images/Logov1.png");
    await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const box = (await logo.boundingBox())!;
    expect(Math.abs(box.width / box.height - 2)).toBeLessThan(0.02);
    await expect(dialog).toContainText("Purok 6, Ising, Carmen, Davao del Norte");
    await expect(dialog.locator(".receipt-brand")).not.toContainText("LOGO Coffee");
    await expect(dialog.getByRole("combobox", { name: "Paper width", exact: true })).toHaveText("80 mm");
    await expect(dialog.getByRole("button", { name: "Print receipt", exact: true })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const scrollers = await dialog.evaluate(element => [...element.querySelectorAll("*")].filter(child => child.scrollHeight > child.clientHeight + 1 && getComputedStyle(child).overflowY === "auto").length);
    expect(scrollers).toBe(1);
    await page.screenshot({ path: `.local/ui-review/receipts/preview-${viewport.width}.png`, animations: "disabled" });
  });
}

for (const width of ["80", "58"] as const) {
  for (const many of [false, true]) {
    test(`${width}mm ${many ? "long" : "short"} print isolates customer content and matches paper width`, async ({ page }) => {
      await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printCalled = "true"; }; });
      await page.goto(`/?receipt&wallet&refunded${many ? "&many-items&long" : ""}`);
      await page.getByRole("button", { name: "View receipt" }).click();
      const dialog = page.getByRole("dialog", { name: "Sale receipt", exact: true });
      if (width === "58") await chooseOption(page, dialog.getByRole("combobox", { name: "Paper width", exact: true }), "58 mm");
      await dialog.getByRole("button", { name: "Print receipt", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");
      const print = page.locator("body > .print-receipt");
      await expect(print).toHaveAttribute("data-paper-width", width);
      await expect(print).toContainText("E-wallet");
      await expect(print).toContainText("Refunded in full");
      await expect(print.locator(".receipt-brand")).not.toContainText("LOGO Coffee");
      await expect(print).not.toContainText(/Preparation cost|Private|Owner ingredient|Wrong order|GCash|Cash received|Change given/);
      await page.emulateMedia({ media: "print" });
      await expect(page.locator("#root")).toBeHidden();
      await expect(print).toBeVisible();
      expect(await print.evaluate(element => [...element.querySelectorAll("table, td, dl, footer")].every(child => child.scrollWidth <= child.clientWidth + 1))).toBe(true);
      await print.screenshot({ path: `.local/ui-review/receipts/print-${width}-${many ? "long" : "short"}.png` });
      // Element screenshots scroll the print document; reset before PDF capture, which fires afterprint.
      await page.evaluate(() => window.scrollTo(0, 0));
      const pdf = await page.pdf({ path: `.local/ui-review/receipts/receipt-${width}-${many ? "long" : "short"}.pdf`, width: `${width}mm`, height: "210mm", printBackground: false });
      const pages = pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
      expect(pages).toBeGreaterThan(0);
      if (!many) expect(pages).toBe(1);
      await page.emulateMedia({ media: "screen" });
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      await expect(print).toHaveCount(0);
      await expect(dialog).toBeVisible();
    });
  }
}

test("logo failure keeps the receipt readable without broken artwork", async ({ page }) => {
  await page.route("**/images/Logov1.png", route => route.fulfill({ status: 404, body: "" }));
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printCalled = "true"; }; });
  await page.goto("/?receipt&single&no-business&staff");
  await page.getByRole("button", { name: "View receipt" }).click();
  const dialog = page.getByRole("dialog", { name: "Sale receipt", exact: true });
  await expect(dialog.locator(".receipt-kind")).toHaveText("Sales receipt");
  await expect(dialog.locator(".receipt-logo")).toHaveCount(0);
  await expect(dialog.locator(".receipt-business")).toHaveCount(0);
  await expect(dialog).not.toContainText("Purok 6");
  await dialog.getByRole("button", { name: "Print receipt", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");
  await expect(page.locator(".print-receipt .receipt-kind")).toHaveText("Sales receipt");
  await expect(page.locator(".print-receipt img")).toHaveCount(0);
});

test("printing waits for the logo and closing the preview cancels preparation", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/images/Logov1.png", async route => { await gate; await route.continue(); });
  await page.addInitScript(() => { window.print = () => { document.documentElement.dataset.printCalled = "true"; }; });
  await page.goto("/?receipt");
  await page.getByRole("button", { name: "View receipt" }).click();
  await page.getByRole("button", { name: "Print receipt", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preparing…", exact: true })).toBeDisabled();
  expect(await page.locator("html").getAttribute("data-print-called")).toBeNull();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".print-receipt")).toHaveCount(0);
  release();
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect.poll(() => page.locator(".receipt-logo").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.locator("html").getAttribute("data-print-called")).toBeNull();
  await page.getByRole("button", { name: "Print receipt", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-print-called", "true");
});

test("recorded adjustments remain distinct from invented taxes and discounts", async ({ page }) => {
  await page.goto("/?receipt&adjustment");
  await page.getByRole("button", { name: "View receipt" }).click();
  const receipt = page.getByRole("article", { name: "Customer receipt" });
  await expect(receipt).toContainText("Recorded adjustment");
  await expect(receipt).toContainText("-₱25.00");
  await expect(receipt.locator(".receipt-grand-total")).toContainText("₱360.00");
  await expect(receipt).not.toContainText(/Tax|Discount|Service charge/);
});

test("a blocked native print dialog leaves the receipt available for retry", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => { throw new Error("Test-only print failure"); }; });
  await page.goto("/?receipt");
  await page.getByRole("button", { name: "View receipt" }).click();
  await page.getByRole("button", { name: "Print receipt", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText("Receipt could not be prepared");
  await expect(page.getByRole("button", { name: "Print receipt", exact: true })).toBeEnabled();
  await expect(page.locator(".print-receipt")).toHaveCount(0);
});
