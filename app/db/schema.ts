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
  uniqueIndex,
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
    /**
     * Our Club's Skill Rating at the Match, from our `clubs/overallStats`
     * Snapshot. Null until the Poll rates the Match (`app/poll/ratings.ts`).
     */
    ourSkillRating: integer(),
    /** The Opponent Rating: the Opponent's Skill Rating at the Match. */
    opponentSkillRating: integer(),
  },
  (table) => [
    index("matches_played_at_idx").on(table.playedAt),
    // Keeps the Poll's backfill lookup cheap once every Match is rated.
    index("matches_unrated_idx")
      .on(table.playedAt)
      .where(sql`our_skill_rating IS NULL`),
  ],
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

/**
 * EA's live Seasons, detected by the Poll when the current-season leaderboard
 * Snapshot's `gamesPlayed` goes down. Season 1 starts at epoch 0, before
 * tracking began. A Match belongs to the latest Season that started at or
 * before it was played. That is worked out at query time (`app/stats/scope.ts`),
 * so Matches stored before a boundary was detected land in the right Season.
 */
export const seasons = sqliteTable("seasons", {
  number: integer().primaryKey(),
  startedAt: integer({ mode: "timestamp_ms" }).notNull(),
});

export type AiJobStatus = "pending" | "done" | "failed";

/**
 * Write-up work queued by the Poll (docs/adr/0006), one row per subject and
 * version: a Session's recap is written once per set of Matches, so a Match
 * added later makes a new version and a new job. A done job is also the
 * audit record of its call: the input sent, its hash, the model, the tokens
 * and the estimated cost.
 */
export const aiJobs = sqliteTable(
  "ai_jobs",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** The writer that queued it, e.g. `session` (`app/ai/writers/`). */
    kind: text().notNull(),
    subjectKey: text().notNull(),
    /** A cheap fingerprint of what the write-up covers, e.g. a Session's Match IDs. */
    version: text().notNull(),
    status: text().$type<AiJobStatus>().notNull(),
    attempts: integer().notNull().default(0),
    /** When a pending job may next be tried (exponential backoff). */
    nextAttemptAt: integer({ mode: "timestamp_ms" }),
    lastError: text(),
    /** SHA-256 of `input`: a done job with the same hash is never paid for twice. */
    inputHash: text(),
    /** The JSON sent to the model, for auditing a write-up. */
    input: text(),
    model: text(),
    inputTokens: integer(),
    outputTokens: integer(),
    cacheReadTokens: integer(),
    cacheWriteTokens: integer(),
    /** Estimated from the prices in `app/ai/config.ts`. */
    costUsd: real(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    finishedAt: integer({ mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("ai_jobs_subject_idx").on(
      table.kind,
      table.subjectKey,
      table.version,
    ),
  ],
);

/**
 * The text written for one subject: a Session recap, a Match report, the
 * State of the club. One job can write several (a Session's recap and its
 * Match reports come from one call). Pages show the latest per subject.
 */
export const aiWriteups = sqliteTable(
  "ai_writeups",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    jobId: integer()
      .notNull()
      .references(() => aiJobs.id),
    /** `WriteupKind` in `app/ai/writeups.ts`. */
    kind: text().notNull(),
    subjectKey: text().notNull(),
    text: text().notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("ai_writeups_subject_idx").on(
      table.kind,
      table.subjectKey,
      sql`${table.id} DESC`,
    ),
  ],
);

export type MilestoneSubject = "player" | "club";

/**
 * Milestones (CLUBS-36): notable achievements by Our Club or a Squad Member,
 * each reached in one Match. Detected after each Poll (`app/milestones/`) and
 * never stored twice: `dedupeKey` is unique. The kinds and their rules live
 * in `app/stats/milestones.ts`.
 */
export const milestones = sqliteTable(
  "milestones",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    /** `MilestoneKind` in `app/stats/milestones.ts`. */
    kind: text().notNull(),
    subject: text().$type<MilestoneSubject>().notNull(),
    /** The Squad Member, for a player Milestone; null for Our Club's. */
    playerId: text().references(() => players.playerId),
    /** The new total or figure: 50 goals, a 9.4 rating, a 5-Match run. */
    value: real().notNull(),
    /** The landmark crossed (50 goals) or the record beaten; null for a one-off feat. */
    threshold: real(),
    /** The Position Group of a first goal in one; null for every other kind. */
    positionGroup: text().$type<PositionGroup>(),
    matchId: text()
      .notNull()
      .references(() => matches.matchId),
    /** The Match's kick-off. */
    achievedAt: integer({ mode: "timestamp_ms" }).notNull(),
    detectedAt: integer({ mode: "timestamp_ms" }).notNull(),
    /** Milestones detected together in one Session: one write-up call covers them. */
    batchKey: text().notNull(),
    /** What makes a Milestone unique, e.g. `player:123:goals:50`. */
    dedupeKey: text().notNull(),
  },
  (table) => [
    uniqueIndex("milestones_dedupe_idx").on(table.dedupeKey),
    index("milestones_achieved_idx").on(table.achievedAt),
    index("milestones_player_idx").on(table.playerId),
    index("milestones_match_idx").on(table.matchId),
    index("milestones_batch_idx").on(table.batchKey),
  ],
);

export type SessionPostStatus = "pending" | "posted" | "failed" | "skipped";

/**
 * The Discord post for each Session (CLUBS-39), keyed by the Session's ID,
 * so a Session is never posted twice. `skipped` marks Sessions that had
 * ended before posting was released; the `RELEASE_BASELINE` row records
 * that release (`app/discord/run.ts`).
 */
export const sessionPosts = sqliteTable("session_posts", {
  sessionId: text().primaryKey(),
  status: text().$type<SessionPostStatus>().notNull(),
  /** Polls that found the Session over but its recap not yet written. */
  pollsWaited: integer().notNull().default(0),
  /** Webhook calls made; the post gives up after `MAX_POST_ATTEMPTS`. */
  attempts: integer().notNull().default(0),
  /** Not before this, e.g. Discord's `retry_after` after a 429. */
  nextAttemptAt: integer({ mode: "timestamp_ms" }),
  lastError: text(),
  postedAt: integer({ mode: "timestamp_ms" }),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
});

export type SeasonReviewPostStatus = "pending" | "posted" | "failed";

/**
 * The Discord post announcing each Season Review (CLUBS-45), keyed by the
 * Season's number, so a review is announced once. A row appears only once
 * the review is written (`app/discord/season-review.ts`).
 */
export const seasonReviewPosts = sqliteTable("season_review_posts", {
  season: integer().primaryKey(),
  status: text().$type<SeasonReviewPostStatus>().notNull(),
  /** Webhook calls made; the post gives up after `MAX_POST_ATTEMPTS`. */
  attempts: integer().notNull().default(0),
  /** Not before this, e.g. Discord's `retry_after` after a 429. */
  nextAttemptAt: integer({ mode: "timestamp_ms" }),
  lastError: text(),
  postedAt: integer({ mode: "timestamp_ms" }),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
});
