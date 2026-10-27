/**
 * Analysis's comparison (CLUBS-60): reads the earlier side's Matches and
 * pairs them with the filter's own. One extra query, only while `?vs=` asks.
 */
import type { Db } from "~/db/client";
import { londonDateKey, WEEKDAYS } from "~/lib/london-time";

import { dateRangeLabel, type StatsFilter } from "./filter";
import { listMatches, type MatchSummary } from "./matches";
import { splitByTimeOfDay, TIME_OF_DAY } from "./outcome-split";
import {
  type ComparedBucket,
  type ComparedFigure,
  type CompareOptions,
  type CompareRequest,
  compareFigures,
  compareOptions,
  compareSide,
  pairBuckets,
} from "./period-compare";
import { listSeasons } from "./seasons";
import { summariseRecord } from "./summaries";
import { splitByWeekday } from "./trends";

export interface PeriodComparisonView {
  /** "Last 7 days" / "Season 2". */
  currentLabel: string;
  /** "7 days before (14 Oct – 20 Oct)" / "Season 1". */
  previousLabel: string;
  previousPlayed: number;
  figures: ComparedFigure[];
  byKickoff: ComparedBucket[];
  byDay: ComparedBucket[];
}

export interface PeriodComparison {
  /** What the filter can be compared with; null hides the control. */
  options: CompareOptions | null;
  /** The `?vs=` in force, or null when off or not allowed. */
  active: CompareRequest;
  view: PeriodComparisonView | null;
}

/**
 * The comparison `request` asks for over `matches` (the filter's own, any
 * order), or just the options when it asks for none.
 */
export async function getPeriodComparison(
  db: Db,
  filter: StatsFilter,
  matches: readonly MatchSummary[],
  request: CompareRequest,
  now: Date,
): Promise<PeriodComparison> {
  const seasons = (await listSeasons(db)).map((s) => s.number);
  const options = compareOptions(filter, seasons, londonDateKey(now));
  const side = compareSide(filter, options, request, now);
  if (!side) return { options, active: null, view: null };
  const earlier = await listMatches(db, side.filter);
  return {
    options,
    active: side.request,
    view: {
      currentLabel:
        filter.dates.kind === "all"
          ? `Season ${filter.season}`
          : dateRangeLabel(filter.dates, now),
      previousLabel: side.label,
      previousPlayed: earlier.length,
      figures: compareFigures(
        summariseRecord(matches),
        summariseRecord(earlier),
      ),
      byKickoff: pairBuckets(
        splitByTimeOfDay(matches),
        splitByTimeOfDay(earlier),
        TIME_OF_DAY.map((t) => t.label),
      ),
      byDay: pairBuckets(
        splitByWeekday(matches),
        splitByWeekday(earlier),
        WEEKDAYS,
      ),
    },
  };
}
