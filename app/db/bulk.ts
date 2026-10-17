import { getTableColumns, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import type { Db } from "./client.ts";

/**
 * Inserts any number of rows with one statement and one bound parameter: the
 * rows travel as a JSON array that SQLite expands with `json_each`. Chain
 * `.onConflictDoNothing()` or `.onConflictDoUpdate()` as with any insert.
 *
 * D1 allows 100 bound parameters per statement, and the free plan allows 50
 * queries per invocation, so per-row or chunked inserts would not fit the
 * first Poll's 30 Matches and their Appearances.
 *
 * Every column is written (missing values as null), because Drizzle's
 * insert-from-select fills all columns in table order.
 */
export function bulkInsert<T extends SQLiteTable>(
  db: Db,
  table: T,
  rows: T["$inferInsert"][],
) {
  const columns = Object.entries(getTableColumns(table));
  const values = rows.map((row) =>
    columns.map(([key, column]) => {
      const value = row[key as keyof typeof row];
      return value === undefined || value === null
        ? null
        : column.mapToDriverValue(value);
    }),
  );
  const extracts = sql.raw(
    columns.map((_, i) => `value ->> '$[${i}]'`).join(", "),
  );
  // `WHERE true` resolves SQLite's parsing ambiguity between a SELECT's join
  // clause and an upsert's ON CONFLICT.
  return db
    .insert(table)
    .select(
      sql`SELECT ${extracts} FROM json_each(${JSON.stringify(values)}) WHERE true`,
    );
}
