import { expect, test } from "@playwright/test";

test("Dashboard redirects unauthenticated requests before streaming financial content", async ({ request }) => {
  const response = await request.get("/dashboard?from=2026-10-01&to=2026-11-03", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/sign-in");
  expect(response.headers()["cache-control"]).not.toContain("public");
  expect(await response.text()).not.toContain("Gross Profit");
});
