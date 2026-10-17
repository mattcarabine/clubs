import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only; Wrangler applies them (`pnpm db:migrate:local`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./migrations",
  casing: "snake_case",
});
