import { defineConfig, devices } from "@playwright/test";
// Offline tests must use versioned production assets, not mutable dev chunks.
const port = process.env.PLAYWRIGHT_PORT ?? "3002";
if (!/^\d{2,5}$/.test(port)) throw new Error("PLAYWRIGHT_PORT must be a local port number");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Multi-page flows include cold Next.js development compilation on Windows.
  timeout: 60_000,
  use: { baseURL, ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
