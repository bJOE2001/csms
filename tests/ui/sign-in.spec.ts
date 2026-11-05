import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 }, { width: 768, height: 1024 }, { width: 393, height: 852 }]) {
  test(`focused sign-in layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator(".topbar, nav, .workspace-sidebar")).toHaveCount(0);
    await expect(page.getByRole("img", { name: "LOGO Coffee", exact: true })).toHaveAttribute("src", "/images/Logov1.png");
    await expect(page.getByRole("link", { name: "Forgot password?", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to website", exact: true })).toHaveAttribute("href", "/");
    const card = (await page.locator(".sign-in-card").boundingBox())!;
    expect(card.width).toBeLessThanOrEqual(440);
    expect(Math.abs(card.x + card.width / 2 - viewport.width / 2)).toBeLessThan(1);
    const stack = (await page.locator(".sign-in-stack").boundingBox())!;
    expect(Math.abs(stack.y + stack.height / 2 - viewport.height / 2)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/ui-review/sign-in/${viewport.width}.png`, animations: "disabled" });
  });
}
test("validation and password visibility remain accessible without submitting or losing input", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter your password.", { exact: true })).toBeVisible();
  const email = page.getByLabel("Email", { exact: true }), password = page.getByLabel("Password", { exact: true });
  await expect(email).toBeFocused();
  await email.fill("bad");
  await password.fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await expect(email).toBeFocused();
  await password.focus();
  await password.evaluate((element: HTMLInputElement) => element.setSelectionRange(3, 7));
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toBeFocused();
  expect(await password.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(3);
  const hide = page.getByRole("button", { name: "Hide password", exact: true });
  await page.keyboard.press("Tab");
  await expect(hide).toBeFocused();
  await expect(hide).toHaveCSS("outline-style", "solid");
  await expect(page.locator(".sign-in-password")).toHaveCSS("outline-width", "0px");
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue("test-only-password");
  expect(await page.locator("html").getAttribute("data-sign-in-calls")).toBeNull();
});
test("failed sign-in retains email, prevents duplicates and keeps errors inline", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill("staff@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByLabel("Password", { exact: true }).press("Enter");
  const pending = page.getByRole("button", { name: "Signing in…", exact: true });
  await expect(pending).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("staff@example.invalid");
  await expect(page.locator("html")).toHaveAttribute("data-sign-in-calls", "1");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});
test("network failures remain retryable on a short mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 390 });
  await page.goto("/sign-in?network");
  await page.getByLabel("Email", { exact: true }).fill("staff@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("try again");
  await page.getByRole("button", { name: "Sign in", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
