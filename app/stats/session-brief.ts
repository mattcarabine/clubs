/**
 * Everything known about a Session at the moment it ended (CLUBS-35): its
 * Matches with both line-ups, the Squad Members' baselines before it, and
 * Our Club's state as of its last kick-off. Session recaps are written from
 * it (`app/ai/writers/session.ts`). Nothing after the Session's end is read,
 * so a brief never changes once the Session is over unless a Match joins it.
 */
import type { Db } from "~/db/client";
import type { Outcome } from "~/lib/domain";

import { weQuit } from "./counted";
import { getMatchDetails, listKickoffs, type MatchDetail } from "./matches";
import {
  type Deviation,
  type DroppedPointsReasons,
  droppedPointsReasons,
  matchAngle,
  type OutcomeSplit,
} from "./outcome-split";
import { getAnalysisAsOf } from "./outcome-split-query";
import { groupSessions, type SessionGroup } from "./sessions";
import {
  type LeaderboardRow,
  leaderboardRows,
  type SquadAppearance,
} from "./squad";
import {
  type AppearanceStats,
  type PlayerTotals,
  type RecordSummary,
  summariseAppearances,
  summariseRecord,
} from "./summaries";

/** How far back a Squad Member's recent baseline reaches. */
export const RECENT_BASELINE_DAYS = 30;

/** How many earlier results set the scene before a Session. */
export const FORM_BEFORE_MATCHES = 10;

/** How many Sessions the club summary looks back over, this one included. */
export const RECENT_SESSIONS = 5;

export interface BriefMatch extends MatchDetail {
  /** 1 for the Session's first Match. */
  place: number;
  /** Against the Wins up to the Session's end; null for a Win, a DNF we quit or too few Wins. */
  droppedPoints: DroppedPointsReasons | null;
  /**
   * Its most unusual stat against every other Match up to the Session's end
   * (`matchAngle`); null for a DNF, whose per-90s over a few minutes say
   * nothing, or with too few Matches.
   */
  angle: Deviation | null;
}

/** A Squad Member's form going into the Session. */
export interface PlayerBaseline {
  playerId: string;
  name: string;
  /** Every Appearance before the Session; null for a debut. */
  allTime: PlayerTotals | null;
  /** Appearances in the `RECENT_BASELINE_DAYS` before the Session; null with none. */
  recent: PlayerTotals | null;
  /** The best single-Match rating before the Session. */
  bestRating: number | null;
  /** The best in the `RECENT_BASELINE_DAYS` before it. */
  bestRecentRating: number | null;
}

export interface RecentSession {
  start: Date;
  matchCount: number;
  record: RecordSummary;
}

/** Our Club as it stood when the Session ended. */
export interface ClubBrief {
  /** Every Competitive Match up to the Session's end. */
  record: RecordSummary;
  split: OutcomeSplit;
  /** The last `FORM_BEFORE_MATCHES` results, this Session's included, oldest first. */
  recentForm: Outcome[];
  /** Current Squad Members' totals over every Match up to the Session's end. */
  squad: LeaderboardRow[];
  /** The last `RECENT_SESSIONS` Sessions, newest (this one) first. */
  recentSessions: RecentSession[];
}

export interface SessionBrief {
  session: SessionGroup;
  /** The first recorded Competitive Match's kick-off: how far back anything "recent" can reach. */
  trackedSince: Date;
  record: RecordSummary;
  /** Oldest first. */
  matches: BriefMatch[];
  /** Every Squad Member who played in it, Former ones included. */
  leaderboard: LeaderboardRow[];
  baselines: PlayerBaseline[];
  /** The `FORM_BEFORE_MATCHES` results before the Session, oldest first. */
  formBefore: Outcome[];
  club: ClubBrief;
}

/** A Session's brief by its ID, or null when no Session starts with that Match. Seven queries. */
export async function getSessionBrief(
  db: Db,
  sessionId: string,
): Promise<SessionBrief | null> {
  const sessions = groupSessions(await listKickoffs(db));
  const index = sessions.findIndex((s) => s.id === sessionId);
  const session = sessions[index];
  if (!session) return null;

  const [analysis, details] = await Promise.all([
    getAnalysisAsOf(db, session.end),
    getMatchDetails(db, session.matchIds),
  ]);
  const start = session.start.getTime();
  const wins = analysis.matches
    .filter((m) => m.outcome === "W")
    .map((m) => analysis.performance(m.matchId));
  const matches = details.map((match, i): BriefMatch => {
    const performance = analysis.performance(match.matchId);
    const others = analysis.matches
      .filter((m) => m.matchId !== match.matchId)
      .map((m) => analysis.performance(m.matchId));
    return {
      ...match,
      place: i + 1,
      droppedPoints:
        match.outcome === "W" || weQuit(match)
          ? null
          : droppedPointsReasons(performance, wins),
      angle: match.dnf ? null : matchAngle(performance, others),
    };
  });

  const inSession = new Set(session.matchIds);
  const sessionAppearances = analysis.squad.filter((a) =>
    inSession.has(a.matchId),
  );
  const before = analysis.squad.filter((a) => a.playedAt.getTime() < start);
  const leaderboard = leaderboardRows(sessionAppearances, {
    includeFormer: true,
  });
  const earlier = analysis.matches.filter((m) => m.playedAt.getTime() < start);

  return {
    session,
    trackedSince: analysis.matches[0]?.playedAt ?? session.start,
    record: summariseRecord(matches),
    matches,
    leaderboard,
    baselines: leaderboard.map((row) =>
      playerBaseline(
        row,
        before.filter((a) => a.playerId === row.playerId),
        start,
      ),
    ),
    formBefore: earlier.slice(-FORM_BEFORE_MATCHES).map((m) => m.outcome),
    club: {
      record: summariseRecord(analysis.matches),
      split: analysis.split,
      recentForm: analysis.matches
        .slice(-FORM_BEFORE_MATCHES)
        .map((m) => m.outcome),
      squad: leaderboardRows(analysis.squad),
      recentSessions: sessions
        .slice(Math.max(0, index + 1 - RECENT_SESSIONS), index + 1)
        .reverse()
        .map((s) => {
          const ids = new Set(s.matchIds);
          return {
            start: s.start,
            matchCount: s.matchIds.length,
            record: summariseRecord(
              analysis.matches.filter((m) => ids.has(m.matchId)),
            ),
          };
        }),
    },
  };
}

/** One Squad Member's baseline from their Appearances before the Session (oldest first). */
export function playerBaseline(
  player: Pick<LeaderboardRow, "playerId" | "name">,
  before: readonly Pick<SquadAppearance, keyof AppearanceStats | "playedAt">[],
  sessionStart: number,
): PlayerBaseline {
  const since = sessionStart - RECENT_BASELINE_DAYS * 86_400_000;
  const recent = before.filter((a) => a.playedAt.getTime() >= since);
  return {
    playerId: player.playerId,
    name: player.name,
    allTime: before.length ? summariseAppearances(before) : null,
    recent: recent.length ? summariseAppearances(recent) : null,
    bestRating: best(before.map((a) => a.rating)),
    bestRecentRating: best(recent.map((a) => a.rating)),
  };
}

function best(ratings: readonly (number | null)[]): number | null {
  const rated = ratings.filter((r): r is number => r !== null);
  return rated.length ? Math.max(...rated) : null;
}
