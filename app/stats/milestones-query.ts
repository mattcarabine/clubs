/**
 * Milestone queries (CLUBS-36): the data detection reads after a Poll, and
 * the stored Milestones pages show. Milestones ignore the `StatsFilter`: like
 * EA's totals, a landmark is a landmark whatever the page's filters.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  max,
  type SQL,
} from "drizzle-orm";

import { latestWriteups } from "~/ai/writeups";
import type { Db } from "~/db/client";
import {
  appearances,
  clubs,
  matches,
  milestones,
  players,
  snapshots,
} from "~/db/schema";
import { displayName, isFormerSquadMember } from "~/roster";

import { toOutcome } from "./convert";
import {
  listKickoffs,
  type MatchSummary,
  summaryColumns,
  toSummary,
} from "./matches";
import {
  type DetectionInput,
  isMilestoneKind,
  MILESTONE_KINDS,
  type MilestoneCategory,
  type MilestoneFigures,
  type MilestoneKind,
  type MilestoneSubject,
  milestoneHeadline,
  type TotalsPoint,
} from "./milestones";
import { isOurAppearance, isShownMatch } from "./scope";
import { sessionIdsByMatch } from "./sessions";

const CAREER_SOURCE = "members/career/stats";
const CLUB_SOURCE = "clubs/overallStats";

export interface DetectionOptions {
  /** Read only each source's latest this-many Snapshots; all of them when absent. */
  snapshotWindow?: number;
}

/**
 * Everything detection needs, in four parallel reads: every shown Match, Our
 * Club's Appearances in them, and the career and club Snapshots (the latest
 * few, or every one for a backfill).
 */
export async function milestoneDetectionInput(
  db: Db,
  { snapshotWindow }: DetectionOptions = {},
): Promise<DetectionInput> {
  const [matchRows, appearanceRows, careerSnapshots, clubSnapshots] =
    await Promise.all([
      db
        .select({
          matchId: matches.matchId,
          playedAt: matches.playedAt,
          goalsFor: matches.goalsFor,
          goalsAgainst: matches.goalsAgainst,
          result: matches.result,
        })
        .from(matches)
        .where(isShownMatch)
        .orderBy(asc(matches.playedAt), asc(matches.matchId)),
      db
        .select({
          matchId: appearances.matchId,
          playerId: appearances.playerId,
          positionGroup: appearances.positionGroup,
          goals: appearances.goals,
          assists: appearances.assists,
          rating: appearances.rating,
          manOfTheMatch: appearances.manOfTheMatch,
        })
        .from(appearances)
        .innerJoin(matches, eq(matches.matchId, appearances.matchId))
        .where(and(isShownMatch, isOurAppearance)),
      totalsSnapshots(db, CAREER_SOURCE, snapshotWindow),
      totalsSnapshots(db, CLUB_SOURCE, snapshotWindow),
    ]);
  return {
    matches: matchRows.map(({ result, ...m }) => ({
      ...m,
      outcome: toOutcome(result),
    })),
    appearances: appearanceRows,
    careerSnapshots,
    clubSnapshots,
  };
}

/** One source's Snapshot rows, oldest first: the latest `window` Snapshots, or all. */
async function totalsSnapshots(
  db: Db,
  source: string,
  window: number | undefined,
): Promise<TotalsPoint[]> {
  const conditions: SQL[] = [eq(snapshots.source, source)];
  if (window !== undefined) {
    const latest = db
      .selectDistinct({ id: snapshots.rawPayloadId })
      .from(snapshots)
      .where(eq(snapshots.source, source))
      .orderBy(desc(snapshots.rawPayloadId))
      .limit(window);
    conditions.push(inArray(snapshots.rawPayloadId, latest));
  }
  return db
    .select({
      takenAt: snapshots.takenAt,
      subjectKey: snapshots.subjectKey,
      playerId: snapshots.playerId,
      stats: snapshots.stats,
    })
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(asc(snapshots.rawPayloadId), asc(snapshots.id));
}

/** One stored Milestone, ready to show. */
export interface MilestoneEntry extends MilestoneFigures {
  id: number;
  kind: MilestoneKind;
  category: MilestoneCategory;
  subject: MilestoneSubject;
  /** The Squad Member, or null for Our Club. */
  playerId: string | null;
  /** The Squad Member's name, or Our Club's. */
  name: string;
  /** "Loltown95 — 50th goal". */
  headline: string;
  /** The kind's badge, e.g. "Landmark". */
  badge: string;
  /** The big figure: "50", "9.4", "+5". */
  figure: string;
  /** The written comment, or the plain sentence until one is written. */
  comment: string;
  achievedAt: Date;
  match: MatchSummary;
  /** The Session the Match was played in. */
  sessionId: string;
}

export interface MilestoneQuery {
  /** Our Club's Milestones, or one Squad Member's; everyone's when absent. */
  who?: "club" | { playerId: string };
  /** Only these Matches' (at most 90, for D1's bound-parameter cap), e.g. a Session's. */
  matchIds?: readonly string[];
  /** Only those detected together (one write-up call). */
  batchKey?: string;
  /** Only those achieved from `start` up to (not including) `end`, e.g. one Season's (CLUBS-45). */
  achievedBetween?: { start: Date; end: Date };
  /** Newest first, at most this many (and at most 90, for D1's bound-parameter cap). */
  limit?: number;
}

/** The most Milestones one query returns. */
export const MILESTONE_PAGE_SIZE = 60;

/**
 * Stored Milestones, newest first, with their Match, Session and comment, in
 * three queries (the Milestones, every kick-off for Sessions, the comments).
 */
export async function listMilestones(
  db: Db,
  clubName: string,
  {
    who,
    matchIds,
    batchKey,
    achievedBetween,
    limit = MILESTONE_PAGE_SIZE,
  }: MilestoneQuery = {},
): Promise<MilestoneEntry[]> {
  const conditions: SQL[] = [isShownMatch];
  if (who === "club") conditions.push(eq(milestones.subject, "club"));
  else if (who) conditions.push(eq(milestones.playerId, who.playerId));
  if (matchIds) conditions.push(inArray(milestones.matchId, [...matchIds]));
  if (batchKey) conditions.push(eq(milestones.batchKey, batchKey));
  if (achievedBetween) {
    conditions.push(
      gte(milestones.achievedAt, achievedBetween.start),
      lt(milestones.achievedAt, achievedBetween.end),
    );
  }

  const [rows, kickoffs] = await Promise.all([
    db
      .select({
        ...summaryColumns,
        id: milestones.id,
        kind: milestones.kind,
        subject: milestones.subject,
        playerId: milestones.playerId,
        personaName: players.personaName,
        value: milestones.value,
        threshold: milestones.threshold,
        positionGroup: milestones.positionGroup,
        achievedAt: milestones.achievedAt,
      })
      .from(milestones)
      .innerJoin(matches, eq(matches.matchId, milestones.matchId))
      .innerJoin(clubs, eq(clubs.clubId, matches.opponentClubId))
      .leftJoin(players, eq(players.playerId, milestones.playerId))
      .where(and(...conditions))
      .orderBy(desc(milestones.achievedAt), desc(milestones.id))
      .limit(Math.min(limit, MILESTONE_PAGE_SIZE)),
    listKickoffs(db),
  ]);
  const known = rows.filter((row) => isMilestoneKind(row.kind));
  const comments = await latestWriteups(
    db,
    "milestone",
    known.map((row) => String(row.id)),
  );
  const sessionOf = sessionIdsByMatch(kickoffs);

  return known.map((row) => {
    const kind = row.kind as MilestoneKind;
    const definition = MILESTONE_KINDS[kind];
    const name = row.playerId
      ? displayName(row.playerId, row.personaName)
      : clubName;
    const figures = {
      value: row.value,
      threshold: row.threshold,
      positionGroup: row.positionGroup,
    };
    return {
      ...figures,
      id: row.id,
      kind,
      category: definition.category,
      subject: row.subject,
      playerId: row.playerId,
      name,
      headline: milestoneHeadline(kind, name, figures),
      badge: definition.badge,
      figure: definition.figure(figures),
      comment:
        comments.get(String(row.id))?.text ??
        definition.sentence(name, figures),
      achievedAt: row.achievedAt,
      match: toSummary(row),
      sessionId: sessionOf.get(row.matchId) ?? row.matchId,
    };
  });
}

/** A batch of Milestones detected together, for the write-up queue. */
export interface MilestoneBatch {
  batchKey: string;
  size: number;
}

/** Every batch, newest first. One query. */
export async function listMilestoneBatches(db: Db): Promise<MilestoneBatch[]> {
  return db
    .select({ batchKey: milestones.batchKey, size: count() })
    .from(milestones)
    .groupBy(milestones.batchKey)
    .orderBy(desc(max(milestones.id)));
}

/** A Squad Member with Milestones, for the feed's filter. */
export interface MilestonePlayer {
  playerId: string;
  name: string;
  former: boolean;
}

/** Every Squad Member with a Milestone, by name. One query. */
export async function listMilestonePlayers(db: Db): Promise<MilestonePlayer[]> {
  const rows = await db
    .selectDistinct({
      playerId: players.playerId,
      personaName: players.personaName,
    })
    .from(milestones)
    .innerJoin(players, eq(players.playerId, milestones.playerId))
    .where(isNotNull(milestones.playerId));
  return rows
    .map(({ playerId, personaName }) => ({
      playerId,
      name: displayName(playerId, personaName),
      former: isFormerSquadMember(playerId),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
