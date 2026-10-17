import { defineConfig } from "vitest/config";

// `pnpm test:live`: smoke tests against live EA and production. On demand
// only, never in CI (docs/adr/0004); `vitest.config.ts` does not include them.
export default defineConfig({
  test: {
    include: ["live/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    // One request at a time, like the Poll, so EA's bot detection stays calm.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
