import { defineConfig, devices } from "@playwright/test";

import { APP_PORT, APP_URL, FAKE_EA_URL } from "./e2e/support/ports.ts";

/** Data-only specs: run once, not per viewport. */
const API_SPECS = /.*\.api\.spec\.ts/;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  // One worker: all tests share the Worker's D1 and the fake EA upstream.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "api",
      testMatch: API_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: API_SPECS,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      testIgnore: API_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      // Replays fixtures/ea; the Worker's test env points EA_BASE_URL here.
      command: "node e2e/fake-ea/main.ts",
      url: `${FAKE_EA_URL}/__control/health`,
      reuseExistingServer: false,
    },
    {
      // Production build in workerd (`test` Wrangler env) on a fresh, migrated local D1.
      command: `pnpm e2e:server --port ${APP_PORT}`,
      url: APP_URL,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
