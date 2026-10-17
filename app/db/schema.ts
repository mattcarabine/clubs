/**
 * D1 schema. Edit this file, then run `pnpm db:generate` to write a migration
 * to `migrations/`; never hand-edit generated migrations.
 *
 * Timestamps are epoch milliseconds (`timestamp_ms`).
 */
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type PollStatus = "ok" | "partial" | "failed";

/** One row per Poll: the Poll's health record. */
export const pollRuns = sqliteTable("poll_runs", {
  id: integer().primaryKey({ autoIncrement: true }),
  startedAt: integer({ mode: "timestamp_ms" }).notNull(),
  finishedAt: integer({ mode: "timestamp_ms" }).notNull(),
  status: text().$type<PollStatus>().notNull(),
  requests: integer().notNull(),
  failures: integer().notNull(),
  payloadsStored: integer().notNull(),
  /** JSON array of `PollError`, null when the Poll had no errors. */
  errors: text({ mode: "json" }).$type<PollError[]>(),
});

export interface PollError {
  endpoint: string;
  variant: string;
  status: number | null;
  kind: string;
  message: string;
}

/**
 * Every EA response we act on, stored verbatim (docs/adr/0003). A response is
 * stored only when its hash differs from the latest one for the same request,
 * so an unchanged Poll writes nothing here.
 */
export const rawPayloads = sqliteTable(
  "raw_payloads",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    endpoint: text().notNull(),
    variant: text().notNull().default(""),
    fetchedAt: integer({ mode: "timestamp_ms" }).notNull(),
    /** SHA-256 of the body with volatile fields removed (see `payloadHash`). */
    hash: text().notNull(),
    body: text().notNull(),
  },
  (table) => [
    index("raw_payloads_request_idx").on(
      table.endpoint,
      table.variant,
      sql`${table.id} DESC`,
    ),
  ],
);
