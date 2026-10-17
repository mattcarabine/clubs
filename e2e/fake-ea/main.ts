/**
 * Starts the fake EA upstream: `node e2e/fake-ea/main.ts`.
 * Playwright starts it for every E2E run (see playwright.config.ts).
 */
import path from "node:path";

import { FAKE_EA_PORT } from "../support/ports.ts";
import { createFakeEa } from "./server.ts";

const fixturesDir = path.resolve(import.meta.dirname, "../../fixtures/ea");

createFakeEa(fixturesDir).listen(FAKE_EA_PORT, () => {
  console.log(`Fake EA upstream listening on http://localhost:${FAKE_EA_PORT}`);
});
