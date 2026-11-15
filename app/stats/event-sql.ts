/**
 * Match Events (ADR 0009) summed in SQL, for queries that total many
 * Appearances per row and so cannot afford to parse each events map in the
 * Worker. The pure versions are in `event-stats.ts`; keep the two in step.
 */
import { type SQL, sql } from "drizzle-orm";

import { appearances } from "~/db/schema";
import { MATCH_EVENT_CODES, type MatchEventStat } from "~/ea/events";

import { STRAIGHT_RED_CODE } from "./event-stats";

/** One Appearance's count of a Match Events code; 0 without it. */
const eventCode = (code: number | string) =>
  sql`coalesce(json_extract(${appearances.events}, ${`$."${code}"`}), 0)`;

/** One Appearance's count of decoded Match Events, added together. */
export const eventCount = (...stats: MatchEventStat[]): SQL =>
  sql.join(
    stats.flatMap((stat) => MATCH_EVENT_CODES[stat].map(eventCode)),
    sql` + `,
  );

/** `yellowCards` (`event-stats.ts`) for one Appearance: the same rule. */
export const yellowCardsSql = sql`case
  when ${appearances.events} is null then 0
  when ${appearances.redCards} >= 1 and ${eventCode(STRAIGHT_RED_CODE)} = 0 then 2
  else min(1, ${eventCount("yellowCards")}) end`;

/** An expression summed over the group's Appearances. */
export const totalOf = (expression: SQL) =>
  sql<number>`coalesce(sum(${expression}), 0)`.mapWith(Number);
