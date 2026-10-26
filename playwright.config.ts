import { defineConfig, devices } from "@playwright/test";

import {
  APP_PORT,
  APP_URL,
  E2E_INSTANCE,
  FAKE_ANTHROPIC_URL,
  FAKE_DISCORD_URL,
  FAKE_DISCORD_WEBHOOK_URL,
  FAKE_EA_BASE_URL,
  FAKE_EA_URL,
} from "./e2e/support/ports.ts";
import { E2E_RELAY_TOKEN } from "./e2e/support/relay.ts";

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
  // Ports are per checkout (e2e/support/ports.ts). Locally, a server already on
  // one is reused only if its health check proves it belongs to this checkout;
  // another worktree's answers 409, so the clash fails the run instead.
  webServer: [
    {
      // Replays fixtures/ea.
      command: "node e2e/fake-ea/main.ts",
      url: `${FAKE_EA_URL}/__control/health?instance=${E2E_INSTANCE}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Answers write-up calls (docs/adr/0006); the real API is never called.
      command: "node e2e/fake-anthropic/main.ts",
      url: `${FAKE_ANTHROPIC_URL}/__control/health?instance=${E2E_INSTANCE}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Answers Session posts (CLUBS-39); Discord is never called.
      command: "node e2e/fake-discord/main.ts",
      url: `${FAKE_DISCORD_URL}/__control/health?instance=${E2E_INSTANCE}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Production build in workerd (`test` Wrangler env) on a fresh, migrated
      // local D1, polling this run's fake EA upstream, writing through its
      // fake Anthropic upstream with a dummy key and posting to its fake Discord.
      // A dummy RELAY_TOKEN opens the home relay's routes (docs/adr/0007).
      command: `pnpm e2e:server --port ${APP_PORT}`,
      env: {
        EA_BASE_URL: FAKE_EA_BASE_URL,
        ANTHROPIC_BASE_URL: FAKE_ANTHROPIC_URL,
        ANTHROPIC_API_KEY: "e2e-dummy-key",
        DISCORD_WEBHOOK_URL: FAKE_DISCORD_WEBHOOK_URL,
        RELAY_TOKEN: E2E_RELAY_TOKEN,
      },
      url: `${APP_URL}/__test/health?ea=${encodeURIComponent(FAKE_EA_BASE_URL)}&anthropic=${encodeURIComponent(FAKE_ANTHROPIC_URL)}&discord=${encodeURIComponent(FAKE_DISCORD_WEBHOOK_URL)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
