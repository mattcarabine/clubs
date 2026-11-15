/**
 * What player summaries are written from (CLUBS-94): one Squad Member's
 * style over every recorded Match up to the end of a London week, once for
 * each Position Group they have played enough in, as the profile's Influence
 * and "How they play" show it.
 */
import type { Db } from "~/db/client";
import {
  type CoachingWeek,
  coachingWeek,
  coachingWeekLastMoment,
  londonWeekStart,
} from "~/lib/coaching-week";
import type { PositionGroup } from "~/lib/domain";
import type { CalendarDate } from "~/lib/london-time";

import {
  type PlayerEventProfile,
  playerEventProfile,
  positionTotals,
} from "./event-stats";
import { DEFAULT_STATS_FILTER } from "./filter";
import { opponentEventAppearances, squadAppearances } from "./squad";
import { groupBy, type PlayerTotals, summariseAppearances } from "./summaries";

/** A Position Group needs this many Appearances before a summary says how they play there. */
export const MIN_SUMMARY_APPEARANCES = 5;

/** A Squad Member due summaries, and the week they are as of. */
export interface PlayerSummarySubject {
  playerId: string;
  /** The Monday of the London week of their latest Appearance. */
  weekStart: CalendarDate;
}

/** The subject of one Position Group's summary: "935000001/Midfielder". */
export function playerSummaryKey(
  playerId: string,
  positionGroup: PositionGroup,
): string {
  return `${playerId}/${positionGroup}`;
}

/**
 * Every Squad Member with `MIN_SUMMARY_APPEARANCES` in a Position Group up
 * to the end of `week`, in ID order, each as of the week they last played
 * in: so new summaries are due only after a week they played. One query.
 */
export async function playerSummarySubjects(
  db: Db,
  week: CoachingWeek,
): Promise<PlayerSummarySubject[]> {
  const apps = await squadAppearances(db, DEFAULT_STATS_FILTER, {
    playedBetween: { start: new Date(0), end: coachingWeekLastMoment(week) },
  });
  return summarySubjects(apps);
}

type Positioned = { positionGroup: PositionGroup | null };

/**
 * The Position Groups with `MIN_SUMMARY_APPEARANCES` among one Squad
 * Member's Appearances, most played first (the Main Position leads).
 */
export function summaryPositions(own: readonly Positioned[]): PositionGroup[] {
  return [...groupBy(own, (a) => a.positionGroup)]
    .filter(
      (entry): entry is [PositionGroup, Positioned[]] =>
        entry[0] !== null && entry[1].length >= MIN_SUMMARY_APPEARANCES,
    )
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([positionGroup]) => positionGroup);
}

/** Pure; exported for unit tests. `appearances` are oldest first. */
export function summarySubjects(
  appearances: readonly (Positioned & { playerId: string; playedAt: Date })[],
): PlayerSummarySubject[] {
  return [...groupBy(appearances, (a) => a.playerId)]
    .filter(([, own]) => summaryPositions(own).length > 0)
    .map(([playerId, own]) => ({
      playerId,
      weekStart: londonWeekStart(own[own.length - 1].playedAt),
    }))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}

/** How a Squad Member plays in one Position Group. */
export interface PositionSummaryBrief {
  positionGroup: PositionGroup;
  /** Their totals there. */
  totals: PlayerTotals;
  /** Their Event Stats there, beside the Yardstick for that position. */
  events: PlayerEventProfile;
}

export interface PlayerSummaryBrief {
  playerId: string;
  name: string;
  /** One per Position Group with enough Appearances, most played first. */
  positions: PositionSummaryBrief[];
}

/**
 * One Squad Member's brief as of the end of the week starting `weekStart`,
 * or null when no Position Group has Match Events to describe by then. Two
 * queries. `nameFor` shapes the name, e.g. for a prompt.
 */
export async function getPlayerSummaryBrief(
  db: Db,
  playerId: string,
  weekStart: CalendarDate,
  nameFor: (name: string) => string = (name) => name,
): Promise<PlayerSummaryBrief | null> {
  const scope = {
    playedBetween: {
      start: new Date(0),
      end: coachingWeekLastMoment(coachingWeek(weekStart)),
    },
  };
  const [team, opponents] = await Promise.all([
    squadAppearances(db, DEFAULT_STATS_FILTER, { ...scope, withEvents: true }),
    opponentEventAppearances(db, DEFAULT_STATS_FILTER, scope),
  ]);
  const own = team.filter((a) => a.playerId === playerId);
  const latest = own.at(-1);
  if (!latest) return null;
  const yardstick = positionTotals(opponents);
  const positions = summaryPositions(own).flatMap((positionGroup) => {
    const there = own.filter((a) => a.positionGroup === positionGroup);
    const events = playerEventProfile(there, team, yardstick);
    return events
      ? [{ positionGroup, totals: summariseAppearances(there), events }]
      : [];
  });
  if (positions.length === 0) return null;
  return { playerId, name: nameFor(latest.name), positions };
}
