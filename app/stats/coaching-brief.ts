/**
 * Everything a Squad Member's weekly coaching notes are written from
 * (CLUBS-44): the week's Appearances, and their Recent changes, Hot or Cold
 * form, stats by Position Group, Outcome Split and all-time totals as the
 * week ended. Competitive Matches only (the default filter), and nothing
 * after the week, so a week's brief never drifts.
 */
import type { Db } from "~/db/client";
import { type CoachingWeek, coachingWeekLastMoment } from "~/lib/coaching-week";

import { DEFAULT_STATS_FILTER } from "./filter";
import { type PlayerOutcomeSplit, playerOutcomeSplit } from "./outcome-split";
import {
  type FormIndicator,
  formIndicator,
  type RecentChanges,
  recentChanges,
} from "./recent-change";
import { type SquadAppearance, squadAppearances } from "./squad";
import { groupBy, type PlayerTotals, summariseAppearances } from "./summaries";

export interface PlayerCoachingBrief {
  playerId: string;
  name: string;
  /** The week's Appearances, oldest first. */
  week: SquadAppearance[];
  weekTotals: PlayerTotals;
  /** The last `RECENT_WINDOW` Appearances up to the week's end against the ones before. */
  recentChanges: RecentChanges;
  formIndicator: FormIndicator | null;
  /**
   * Every Appearance up to the week's end, per Position Group (each
   * total's `positionGroup`), most Appearances first.
   */
  byPositionGroup: PlayerTotals[];
  outcomeSplit: PlayerOutcomeSplit;
  /** Every Appearance up to the week's end. */
  allTime: PlayerTotals;
}

/**
 * The Squad Members with an Appearance in the week, in ID order: the
 * week's version, so a late Match bringing in someone new rewrites it. One
 * query over the week's Matches.
 */
export async function coachingPlayerIds(
  db: Db,
  week: CoachingWeek,
): Promise<string[]> {
  const apps = await squadAppearances(db, DEFAULT_STATS_FILTER, {
    playedBetween: { start: week.from, end: coachingWeekLastMoment(week) },
  });
  return [...new Set(apps.map((a) => a.playerId))].sort();
}

/**
 * A brief for each Squad Member who played in the week, by name. One query.
 * `nameFor` shapes the name the briefs' copy uses, e.g. for a prompt.
 */
export async function getCoachingBriefs(
  db: Db,
  week: CoachingWeek,
  nameFor: (name: string) => string = (name) => name,
): Promise<PlayerCoachingBrief[]> {
  const apps = await squadAppearances(db, DEFAULT_STATS_FILTER, {
    playedBetween: { start: new Date(0), end: coachingWeekLastMoment(week) },
  });
  return coachingBriefs(apps, week, nameFor);
}

/**
 * The briefs from Our Club's Appearances up to the week's end (oldest
 * first): one per Squad Member with an Appearance in the week, by name.
 * Pure; exported for unit tests.
 */
export function coachingBriefs(
  appearances: readonly SquadAppearance[],
  week: CoachingWeek,
  nameFor: (name: string) => string = (name) => name,
): PlayerCoachingBrief[] {
  const briefs: PlayerCoachingBrief[] = [];
  for (const [playerId, all] of groupBy(appearances, (a) => a.playerId)) {
    const upToWeekEnd = all.filter((a) => a.playedAt < week.to);
    const inWeek = upToWeekEnd.filter((a) => a.playedAt >= week.from);
    if (inWeek.length === 0) continue;
    const name = nameFor(upToWeekEnd[upToWeekEnd.length - 1].name);
    briefs.push({
      playerId,
      name,
      week: inWeek,
      weekTotals: summariseAppearances(inWeek),
      recentChanges: recentChanges(upToWeekEnd, name),
      formIndicator: formIndicator(upToWeekEnd),
      byPositionGroup: [
        ...groupBy(upToWeekEnd, (a) => a.positionGroup).values(),
      ]
        .map((apps) => summariseAppearances(apps))
        .sort((a, b) => b.appearances - a.appearances),
      outcomeSplit: playerOutcomeSplit(upToWeekEnd, false),
      allTime: summariseAppearances(upToWeekEnd),
    });
  }
  return briefs.sort((a, b) => a.name.localeCompare(b.name));
}
