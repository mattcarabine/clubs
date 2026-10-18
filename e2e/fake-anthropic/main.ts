/**
 * Starts the fake Anthropic upstream: `node e2e/fake-anthropic/main.ts`.
 * Playwright starts it for every E2E run (see playwright.config.ts).
 */
import { E2E_INSTANCE, FAKE_ANTHROPIC_PORT } from "../support/ports.ts";
import { createFakeAnthropic } from "./server.ts";

createFakeAnthropic(E2E_INSTANCE).listen(FAKE_ANTHROPIC_PORT, () => {
  console.log(
    `Fake Anthropic upstream listening on http://localhost:${FAKE_ANTHROPIC_PORT}`,
  );
});
