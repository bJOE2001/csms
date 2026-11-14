import { expect, test } from "@playwright/test";

test("public account screens fit narrow and wide viewports", async ({
  page,
}, testInfo) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/login", "/forgot-password", "/reset-password"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${route.slice(1)}-${width}.png`),
        fullPage: true,
      });
      if (width === 375) {
        for (const input of await page.locator("input").all()) {
          await expect(input).toHaveCSS("font-size", "16px");
        }
      }
    }
  }
});

test("sign-in prevents duplicate submissions without resizing its button", async ({
  page,
}) => {
  // Hold the action in the browser; this test sends no credentials to Auth.
  let releaseRequest: () => void = () => {};
  const heldRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/login", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await heldRequest;
    await route.abort();
  });
  try {
    await page.goto("/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("ui-check@example.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("ui-check-placeholder");
    const button = page.getByRole("button", { name: "Sign in", exact: true });
    const before = await button.boundingBox();
    await button.click();
    const pending = page.getByRole("button", {
      name: "Signing in…",
      exact: true,
    });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    const after = await pending.boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
  } finally {
    releaseRequest();
  }
});

test("sign-in transport failure preserves the form and offers a safe retry", async ({ page }) => {
  await page.route("**/login", route => route.request().method() === "POST" ? route.abort() : route.continue());
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("ui-check@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("ui-check-placeholder");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".sign-in-card").getByRole("alert")).toContainText("check your connection");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("ui-check@example.invalid");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});
