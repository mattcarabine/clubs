import { defineConfig } from "vitest/config";

// Unit tests are reserved for pure logic: parsers and stat formulas (docs/adr/0004).
export default defineConfig({
  test: {
    include: [
      "app/**/*.test.ts",
      "workers/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    environment: "node",
  },
  resolve: {
    tsconfigPaths: true,
  },
});
