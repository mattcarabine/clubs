import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema.ts";

/** Drizzle over the D1 binding. Column names are snake_case in SQL. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema, casing: "snake_case" });
}

export type Db = ReturnType<typeof getDb>;
