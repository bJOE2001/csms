import { test, expect } from "@playwright/test";

test("Expenses redirects unauthenticated requests and never caches financial pages publicly", async ({ request }) => {
  const response = await request.get("/expenses?from=2026-11-01&to=2026-11-03", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/login");
  expect(response.headers()["cache-control"]).toContain("no-store");
});
