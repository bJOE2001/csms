import { expect, test } from "@playwright/test";

test("removed demo routes return 404 and sign-in has no demo entry", async ({ page, request }) => {
  for (const path of ["/demo", "/demo/menu", "/demo/recipes", "/demo/planning"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.goto("/sign-in");
  await expect(page.getByRole("link", { name: /demo/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
});
