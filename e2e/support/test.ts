/**
 * The E2E `test`: Playwright's, plus harness fixtures. Every test starts with
 * an empty D1 and a fake EA upstream serving the recorded fixtures.
 *
 *   import { expect, test } from "./support/test";
 *   test("...", async ({ fakeEa, triggerPoll, db }) => { ... });
 */
import { type APIRequestContext, test as base, expect } from "@playwright/test";

import { fakeAnthropic } from "./fake-anthropic.ts";
import { fakeEa } from "./fake-ea.ts";

export interface TestDb {
  /** All rows of a D1 table (snake_case columns), in insertion order. */
  rows<T = Record<string, unknown>>(table: string): Promise<T[]>;
}

interface HarnessFixtures {
  fakeEa: typeof fakeEa;
  /** The fake Anthropic upstream that write-ups call (docs/adr/0006). */
  fakeAnthropic: typeof fakeAnthropic;
  /**
   * Runs one Poll through the Worker's real scheduled handler and waits for
   * it. `at` (default `pollAt`) is the cron's scheduled time, the clock the
   * write-ups judge what is due by; the Poll itself always runs at now.
   */
  triggerPoll: (at?: Date) => Promise<void>;
  /** The default scheduled time for `triggerPoll`; unset means now. Set with `test.use`. */
  pollAt: Date | undefined;
  db: TestDb;
  /** Resets D1 and both fake upstreams before each test. Automatic. */
  cleanState: undefined;
}

export const test = base.extend<HarnessFixtures>({
  cleanState: [
    async ({ request }, use) => {
      await Promise.all([
        resetDb(request),
        fakeEa.reset(),
        fakeAnthropic.reset(),
      ]);
      await use(undefined);
    },
    { auto: true },
  ],

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern.
  fakeEa: async ({}, use) => {
    await use(fakeEa);
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructuring pattern.
  fakeAnthropic: async ({}, use) => {
    await use(fakeAnthropic);
  },

  pollAt: [undefined, { option: true }],

  triggerPoll: async ({ request, pollAt }, use) => {
    await use(async (at = pollAt) => {
      // Miniflare reads `time` (epoch ms) as the event's `scheduledTime`.
      const res = await request.get(
        `/cdn-cgi/local/scheduled${at ? `?time=${at.getTime()}` : ""}`,
      );
      expect(res.ok(), await res.text()).toBe(true);
    });
  },

  db: async ({ request }, use) => {
    await use({
      async rows(table) {
        const res = await request.get(`/__test/tables/${table}`);
        expect(res.ok(), await res.text()).toBe(true);
        return res.json();
      },
    });
  },
});

export { expect };

async function resetDb(request: APIRequestContext) {
  const res = await request.post("/__test/reset");
  expect(res.ok(), `D1 reset failed: ${res.status()}`).toBe(true);
}
