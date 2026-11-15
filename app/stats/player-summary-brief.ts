/**
 * What a player summary is written from (CLUBS-94): one Squad Member's style
 * over every recorded Match up to the end of a London week, in their Main
 * Position, as the profile's Influence and "How they play" show it.
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
import { inMainPosition, mainPosition } from "./positions";
import { opponentEventAppearances, squadAppearances } from "./squad";
import { groupBy, type PlayerTotals, summariseAppearances } from "./summaries";

/** A Squad Member needs this many Appearances before a summary says how they play. */
export const MIN_SUMMARY_APPEARANCES = 5;

/** A Squad Member due a summary, and the week it is as of. */
export interface PlayerSummarySubject {
  playerId: string;
  /** The Monday of the London week of their latest Appearance. */
  weekStart: CalendarDate;
}

/**
 * Every Squad Member with `MIN_SUMMARY_APPEARANCES` up to the end of `week`,
 * in ID order, each as of the week they last played in: so a new summary is
 * due only after a week they played. One query.
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

/** Pure; exported for unit tests. `appearances` are oldest first. */
export function summarySubjects(
  appearances: readonly { playerId: string; playedAt: Date }[],
): PlayerSummarySubject[] {
  return [...groupBy(appearances, (a) => a.playerId)]
    .filter(([, own]) => own.length >= MIN_SUMMARY_APPEARANCES)
    .map(([playerId, own]) => ({
      playerId,
      weekStart: londonWeekStart(own[own.length - 1].playedAt),
    }))
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}

export interface PlayerSummaryBrief {
  playerId: string;
  name: string;
  mainPosition: PositionGroup | null;
  /** Their totals in their Main Position. */
  totals: PlayerTotals;
  /** Their Event Stats in their Main Position, beside the Yardstick. */
  events: PlayerEventProfile;
}

/**
 * One Squad Member's brief as of the end of the week starting `weekStart`,
 * or null when they have no Appearance with Match Events by then. Two
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
  const counted = inMainPosition(own, true);
  const events = playerEventProfile(counted, team, positionTotals(opponents));
  if (!events) return null;
  return {
    playerId,
    name: nameFor(latest.name),
    mainPosition: mainPosition(own),
    totals: summariseAppearances(counted),
    events,
  };
}
