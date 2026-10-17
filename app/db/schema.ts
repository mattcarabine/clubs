/**
 * D1 schema. Edit this file, then run `pnpm db:generate` to write a migration
 * to `migrations/`; never hand-edit generated migrations.
 *
 * Timestamps are epoch milliseconds (`timestamp_ms`). EA IDs are text: match
 * IDs are 15 digits and EA sends them as strings.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

import type { MatchKind, MatchResult, PositionGroup } from "../ea/parse.ts";

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
  matchesAdded: integer().notNull().default(0),
  /** Snapshot rows written: one per Squad Member or club in a changed payload. */
  snapshotsAdded: integer().notNull().default(0),
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

/** Our Club and every Opponent we have played. */
export const clubs = sqliteTable("clubs", {
  clubId: text().primaryKey(),
  name: text(),
});

/**
 * Every player seen in a Match, on either side, keyed by EA's stable player
 * ID. `personaName` and `clubId` are the latest seen; persona names change.
 */
export const players = sqliteTable("players", {
  playerId: text().primaryKey(),
  clubId: text()
    .notNull()
    .references(() => clubs.clubId),
  personaName: text(),
  firstSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer({ mode: "timestamp_ms" }).notNull(),
});

/** One completed Match, from Our Club's point of view. */
export const matches = sqliteTable(
  "matches",
  {
    matchId: text().primaryKey(),
    matchType: text().$type<MatchKind>().notNull(),
    playedAt: integer({ mode: "timestamp_ms" }).notNull(),
    opponentClubId: text()
      .notNull()
      .references(() => clubs.clubId),
    goalsFor: integer().notNull(),
    goalsAgainst: integer().notNull(),
    result: text().$type<MatchResult>().notNull(),
    dnf: integer({ mode: "boolean" }).notNull(),
    /** The Raw Payload this Match was first parsed from. */
    rawPayloadId: integer()
      .notNull()
      .references(() => rawPayloads.id),
    ingestedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("matches_played_at_idx").on(table.playedAt)],
);

/** One player's Appearance in one Match, for both clubs. */
export const appearances = sqliteTable(
  "appearances",
  {
    matchId: text()
      .notNull()
      .references(() => matches.matchId),
    playerId: text()
      .notNull()
      .references(() => players.playerId),
    clubId: text()
      .notNull()
      .references(() => clubs.clubId),
    positionGroup: text().$type<PositionGroup>(),
    goals: integer().notNull(),
    assists: integer().notNull(),
    shots: integer().notNull(),
    passesMade: integer().notNull(),
    passAttempts: integer().notNull(),
    tacklesMade: integer().notNull(),
    tackleAttempts: integer().notNull(),
    rating: real(),
    manOfTheMatch: integer({ mode: "boolean" }).notNull(),
    redCards: integer().notNull(),
    saves: integer().notNull(),
    goalsConceded: integer().notNull(),
    cleanSheet: integer({ mode: "boolean" }).notNull(),
    secondsPlayed: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.playerId] }),
    index("appearances_player_idx").on(table.playerId),
  ],
);

/**
 * EA's running totals for one Squad Member or Our Club, copied from a changed
 * Raw Payload. The rows sharing a `rawPayloadId` form one Snapshot.
 */
export const snapshots = sqliteTable(
  "snapshots",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    rawPayloadId: integer()
      .notNull()
      .references(() => rawPayloads.id),
    takenAt: integer({ mode: "timestamp_ms" }).notNull(),
    /** The EA endpoint, e.g. `members/stats`. */
    source: text().notNull(),
    subject: text().$type<"member" | "club">().notNull(),
    /** Persona name for a member (EA sends no ID here), club ID for a club. */
    subjectKey: text().notNull(),
    /** The member's player ID, when the persona name matches a known player. */
    playerId: text().references(() => players.playerId),
    /** EA's fields as sent, with numeric strings coerced to numbers. */
    stats: text({ mode: "json" }).$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("snapshots_subject_idx").on(
      table.source,
      table.subjectKey,
      table.takenAt,
    ),
  ],
);
