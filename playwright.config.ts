import { defineConfig, devices } from "@playwright/test";

import "dotenv/config";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const runsLocalApp = new URL(baseURL).hostname === "127.0.0.1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: runsLocalApp
    ? {
        command:
          "NODE_OPTIONS=--import=$(pwd)/e2e/node-network.mjs corepack pnpm -F @acme/nextjs with-env next dev --webpack",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
