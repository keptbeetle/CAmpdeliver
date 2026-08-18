import { defineConfig, devices } from "@playwright/test";

import "dotenv/config";

const baseURL = process.env.EXPO_E2E_BASE_URL ?? "http://127.0.0.1:8082";

export default defineConfig({
  testDir: "./e2e-expo",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report-expo", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "corepack pnpm -F @acme/expo with-env expo start --web --port 8082 --clear",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
