/**
 * Session queries (CLUBS-34). Sessions are worked out from every shown
 * Match's kick-off on each request, with no table of their own: one small
 * query of IDs and times, grouped by `groupSessions`.
 */
import type { Db } from "~/db/client";

import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import { listKickoffs, listMatches, type MatchSummary } from "./matches";
import type { UsualComparisonRow } from "./outcome-split";
import { getUsualComparison } from "./outcome-split-query";
import {
  groupSessions,
  pageSessions,
  type SessionGroup,
  sessionTopPerformer,
} from "./sessions";
import {
  type LeaderboardRow,
  leaderboardRows,
  squadAppearances,
} from "./squad";
import { groupBy, type RecordSummary, summariseRecord } from "./summaries";

/** One Session on the Matches page, narrowed to the Matches the filter selects. */
export interface SessionSummary {
  id: string;
  /** The Session's first and last kick-offs, whatever the filter. */
  start: Date;
  end: Date;
  /** Every Match in the Session, whatever the filter. */
  matchCount: number;
  /** The Matches the filter selects, newest first. */
  matches: MatchSummary[];
  /** Over `matches`. */
  record: RecordSummary;
  /** Over `matches`; null when no Squad Member played in them. */
  topPerformer: LeaderboardRow | null;
}

export interface SessionPage {
  /** Newest first. */
  sessions: SessionSummary[];
  pages: number;
  /** Matches the filter selects, across every page. */
  total: number;
}

export interface SessionPageOptions {
  /** 1 for the newest Sessions. */
  page: number;
  /** Each page holds whole Sessions until it has at least this many Matches. */
  pageSize: number;
}

/**
 * A page of Sessions, newest first, holding the Matches the filter selects.
 * Sessions are grouped over every shown Match first, so filtering only hides
 * Matches; a Session with none left is left out. Three queries.
 */
export async function listSessionPage(
  db: Db,
  filter: StatsFilter,
  { page, pageSize }: SessionPageOptions,
): Promise<SessionPage> {
  const [kickoffs, shown] = await Promise.all([
    listKickoffs(db),
    listMatches(db, filter),
  ]);
  const sessionOf = new Map(
    groupSessions(kickoffs).flatMap((session) =>
      session.matchIds.map((id) => [id, session] as const),
    ),
  );
  // Every filtered Match has a kick-off, so the fallback (its own Session) never runs.
  const soloSession = (m: MatchSummary): SessionGroup => ({
    id: m.matchId,
    matchIds: [m.matchId],
    start: m.playedAt,
    end: m.playedAt,
  });
  // `shown` is newest first, so the Sessions come out newest first too.
  const bySession = [
    ...groupBy(shown, (m) => sessionOf.get(m.matchId) ?? soloSession(m)),
  ];
  const pages = pageSessions(
    bySession.map(([, matches]) => matches.length),
    pageSize,
  );
  const range = pages[page - 1];
  const onPage = range ? bySession.slice(...range) : [];
  const pageMatches = onPage.flatMap(([, matches]) => matches);
  const newest = pageMatches[0];
  const oldest = pageMatches.at(-1);

  const appearances =
    newest && oldest
      ? await squadAppearances(db, filter, {
          playedBetween: { start: oldest.playedAt, end: newest.playedAt },
        })
      : [];
  const appearancesByMatch = groupBy(appearances, (a) => a.matchId);

  return {
    sessions: onPage.map(([session, matches]) => ({
      id: session.id,
      start: session.start,
      end: session.end,
      matchCount: session.matchIds.length,
      matches,
      record: summariseRecord(matches),
      topPerformer: sessionTopPerformer(
        leaderboardRows(
          matches
            .flatMap((m) => appearancesByMatch.get(m.matchId) ?? [])
            // Oldest first, as `leaderboardRows` expects.
            .reverse(),
          { includeFormer: true },
        ),
      ),
    })),
    pages: pages.length,
    total: shown.length,
  };
}

/** One whole Session, whatever the filter: the Session page. */
export interface SessionDetail {
  id: string;
  start: Date;
  end: Date;
  /** Oldest first. */
  matches: MatchSummary[];
  record: RecordSummary;
  /** One row per Squad Member who played, Former ones included. */
  players: LeaderboardRow[];
  /** This Session's per-90s beside every Match's; null with too few other Matches. */
  usual: UsualComparisonRow[] | null;
}

/** A Session by its ID (its first Match's), or null when no Session starts with that Match. */
export async function getSession(
  db: Db,
  sessionId: string,
): Promise<SessionDetail | null> {
  const session = (await listSessions(db)).find((s) => s.id === sessionId);
  if (!session) return null;
  const scope = {
    playedBetween: { start: session.start, end: session.end },
  };
  const [matches, appearances, usual] = await Promise.all([
    listMatches(db, DEFAULT_STATS_FILTER, { ...scope, order: "oldest" }),
    squadAppearances(db, DEFAULT_STATS_FILTER, scope),
    getUsualComparison(db, session.matchIds),
  ]);
  return {
    id: session.id,
    start: session.start,
    end: session.end,
    matches,
    record: summariseRecord(matches),
    players: leaderboardRows(appearances, { includeFormer: true }),
    usual,
  };
}

/** The Session a Match was played in, or null for an unknown or unshown Match. */
export async function sessionOfMatch(
  db: Db,
  matchId: string,
): Promise<SessionGroup | null> {
  const sessions = await listSessions(db);
  return sessions.find((s) => s.matchIds.includes(matchId)) ?? null;
}

/** The latest Session, or null before the first Match. */
export async function latestSession(db: Db): Promise<SessionGroup | null> {
  return (await listSessions(db)).at(-1) ?? null;
}

/** Every Session, oldest first. */
async function listSessions(db: Db): Promise<SessionGroup[]> {
  return groupSessions(await listKickoffs(db));
}
