/**
 * Starts the fake Discord webhook: `node e2e/fake-discord/main.ts`.
 * Playwright starts it for every E2E run (see playwright.config.ts).
 */
import { E2E_INSTANCE, FAKE_DISCORD_PORT } from "../support/ports.ts";
import { createFakeDiscord } from "./server.ts";

createFakeDiscord(E2E_INSTANCE).listen(FAKE_DISCORD_PORT, () => {
  console.log(
    `Fake Discord webhook listening on http://localhost:${FAKE_DISCORD_PORT}`,
  );
});
