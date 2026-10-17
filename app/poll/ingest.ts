/**
 * Derives the normalised tables (docs/adr/0003) from the Raw Payloads a Poll
 * is about to store. Builds statements only; `recordPoll` runs them in the
 * same batch as the payloads, so a payload and its derived rows land together.
 */
import { eq, inArray, type SQL, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { bulkInsert } from "../db/bulk.ts";
import type { Db } from "../db/client.ts";
import {
  appearances,
  clubs,
  matches,
  players,
  snapshots,
} from "../db/schema.ts";
import type { MatchType } from "../ea/endpoints.ts";
import {
  isSnapshotEndpoint,
  type ParsedMatch,
  parseMatches,
  parseSnapshotEntries,
} from "../ea/parse.ts";
import { seasonStatements } from "./seasons.ts";

/** A Raw Payload being stored by this Poll, with its assigned ID. */
export interface StoredPayload {
  id: number;
  endpoint: string;
  variant: string;
  fetchedAt: Date;
  json: unknown;
}

export interface Ingestion {
  statements: BatchItem<"sqlite">[];
  matchesAdded: number;
  snapshotsAdded: number;
}

export async function ingestPayloads(
  db: Db,
  payloads: StoredPayload[],
  ourClubId: string,
  now: Date,
): Promise<Ingestion> {
  const newMatches = await findNewMatches(db, payloads, ourClubId);
  const ourPlayers = new Map<string, string>();
  const statements = matchStatements(
    db,
    newMatches,
    now,
    ourPlayers,
    ourClubId,
  );

  const snapshotRows = await snapshotRowsFor(
    db,
    payloads,
    ourClubId,
    ourPlayers,
  );
  statements.push(...(await seasonStatements(db, snapshotRows, ourClubId)));
  if (snapshotRows.length)
    statements.push(bulkInsert(db, snapshots, snapshotRows));

  return {
    statements,
    matchesAdded: newMatches.length,
    snapshotsAdded: snapshotRows.length,
  };
}

interface NewMatch {
  match: ParsedMatch;
  rawPayloadId: number;
}

/** Parsed Matches from changed payloads that are not stored yet, once each. */
async function findNewMatches(
  db: Db,
  payloads: StoredPayload[],
  ourClubId: string,
): Promise<NewMatch[]> {
  const parsed = new Map<string, NewMatch>();
  for (const payload of payloads) {
    if (payload.endpoint !== "clubs/matches") continue;
    const variant = payload.variant as MatchType;
    for (const match of parseMatches(payload.json, variant, ourClubId)) {
      if (!parsed.has(match.matchId)) {
        parsed.set(match.matchId, { match, rawPayloadId: payload.id });
      }
    }
  }
  if (!parsed.size) return [];

  const known = await db
    .select({ matchId: matches.matchId })
    .from(matches)
    .where(inArray(matches.matchId, [...parsed.keys()]));
  for (const { matchId } of known) parsed.delete(matchId);
  return [...parsed.values()];
}

/**
 * Statements for new Matches, their clubs, players and Appearances. Fills
 * `ourPlayers` (persona name to player ID) with Our Club's players seen here.
 */
function matchStatements(
  db: Db,
  newMatches: NewMatch[],
  now: Date,
  ourPlayers: Map<string, string>,
  ourClubId: string,
): BatchItem<"sqlite">[] {
  if (!newMatches.length) return [];

  const clubRows = new Map<string, typeof clubs.$inferInsert>();
  const playerRows = new Map<string, typeof players.$inferInsert>();
  // Oldest first, so later Matches win for persona names and clubs.
  const ordered = [...newMatches].sort(
    (a, b) => a.match.playedAt.getTime() - b.match.playedAt.getTime(),
  );
  for (const { match } of ordered) {
    for (const club of match.clubs) clubRows.set(club.clubId, club);
    for (const appearance of match.appearances) {
      const previous = playerRows.get(appearance.playerId);
      playerRows.set(appearance.playerId, {
        playerId: appearance.playerId,
        clubId: appearance.clubId,
        personaName: appearance.personaName,
        firstSeenAt: previous?.firstSeenAt ?? match.playedAt,
        lastSeenAt: match.playedAt,
      });
      if (appearance.clubId === ourClubId && appearance.personaName) {
        ourPlayers.set(appearance.personaName, appearance.playerId);
      }
    }
  }

  return [
    bulkInsert(db, clubs, [...clubRows.values()]).onConflictDoUpdate({
      target: clubs.clubId,
      set: { name: sql`coalesce(excluded.name, clubs.name)` },
    }),
    bulkInsert(db, players, [...playerRows.values()]).onConflictDoUpdate({
      target: players.playerId,
      set: {
        personaName: latestSeen("persona_name"),
        clubId: latestSeen("club_id"),
        firstSeenAt: sql`min(players.first_seen_at, excluded.first_seen_at)`,
        lastSeenAt: sql`max(players.last_seen_at, excluded.last_seen_at)`,
      },
    }),
    bulkInsert(
      db,
      matches,
      newMatches.map(({ match, rawPayloadId }) => ({
        matchId: match.matchId,
        matchType: match.matchType,
        playedAt: match.playedAt,
        opponentClubId: match.opponentClubId,
        goalsFor: match.goalsFor,
        goalsAgainst: match.goalsAgainst,
        result: match.result,
        dnf: match.dnf,
        rawPayloadId,
        ingestedAt: now,
      })),
    ).onConflictDoNothing(),
    bulkInsert(
      db,
      appearances,
      newMatches.flatMap(({ match }) =>
        match.appearances.map(({ personaName: _, ...appearance }) => ({
          ...appearance,
          matchId: match.matchId,
        })),
      ),
    ).onConflictDoNothing(),
  ];
}

/**
 * A `players` upsert value that keeps the latest-seen persona name or club,
 * whatever order Matches arrive in. A missing (null) value never replaces a
 * known one.
 */
function latestSeen(column: "persona_name" | "club_id"): SQL {
  return sql.raw(
    `CASE WHEN excluded.last_seen_at >= players.last_seen_at THEN coalesce(excluded.${column}, players.${column}) ELSE players.${column} END`,
  );
}

/**
 * Snapshot rows for every changed Snapshot payload. Members are matched to a
 * player ID by persona name, since EA's member endpoints carry no IDs.
 */
async function snapshotRowsFor(
  db: Db,
  payloads: StoredPayload[],
  ourClubId: string,
  ourPlayers: Map<string, string>,
): Promise<(typeof snapshots.$inferInsert)[]> {
  const entries = payloads.flatMap((payload) =>
    isSnapshotEndpoint(payload.endpoint)
      ? parseSnapshotEntries(payload.endpoint, payload.json, ourClubId).map(
          (entry) => ({ ...entry, payload }),
        )
      : [],
  );
  if (!entries.length) return [];

  if (entries.some((entry) => entry.subject === "member")) {
    const known = await db
      .select({ playerId: players.playerId, personaName: players.personaName })
      .from(players)
      .where(eq(players.clubId, ourClubId));
    for (const { playerId, personaName } of known) {
      // Players seen in this Poll's Matches are newer, so they take priority.
      if (personaName && !ourPlayers.has(personaName)) {
        ourPlayers.set(personaName, playerId);
      }
    }
  }

  return entries.map(({ payload, subject, subjectKey, stats }) => ({
    rawPayloadId: payload.id,
    takenAt: payload.fetchedAt,
    source: payload.endpoint,
    subject,
    subjectKey,
    playerId:
      subject === "member" ? (ourPlayers.get(subjectKey) ?? null) : null,
    stats,
  }));
}
