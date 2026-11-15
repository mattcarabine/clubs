/**
 * Session standouts (CLUBS-96): what Our Club did particularly well or
 * badly in one Session, set against its other Sessions. A stat stands out
 * when the Session's figure ranks among the best or worst fifth of them.
 * Ranks, not scores: "best of 24 sessions" needs no explaining. Pure.
 */
import { formatCount } from "~/lib/number-format";

import { weightedMean } from "./formulas";
import {
  DETAIL_METRICS,
  type MatchPerformance,
  PERFORMANCE_METRICS,
  type PerformanceMetric,
  statName,
  withoutNulls,
} from "./outcome-split";
import { DRIVER_STATS } from "./result-drivers";

/** A Session needs this many Matches to be compared, or compared with. */
export const MIN_SESSION_MATCHES = 2;
/** How many other Sessions there must be before any rank means something. */
export const MIN_OTHER_SESSIONS = 4;
/** How many standouts each list shows. */
export const TOP_STANDOUTS = 3;
/** A figure stands out in the best or worst 1 in this many Sessions. */
const STANDOUT_FRACTION = 5;

type Club = "ours" | "opponent";
const CLUBS: readonly Club[] = ["ours", "opponent"];

/** The stats compared and whether more is good for the club doing it: the result drivers, and goals. */
const BETTER: Record<string, "higher" | "lower"> = {
  goals: "higher",
  ...DRIVER_STATS,
};

/** One stat in which the Session ranks among our best or worst. */
export interface SessionStandout {
  /** "ours-ball-lost". */
  id: string;
  /** "Ball lost per 90", "Opponent shots per 90". */
  label: string;
  /** The Session's figure. */
  value: string;
  /** The figure over the other Sessions' Matches. */
  usual: string;
  /** 1 for the best (in `well`) or the worst (in `badly`). */
  rank: number;
  /** "Best of 24 sessions", "2nd worst of 24 sessions". */
  standing: string;
}

export interface SessionStandouts {
  well: SessionStandout[];
  badly: SessionStandout[];
  /**
   * How many Sessions could be ranked, this one included. A stat's own
   * `standing` can count fewer: older Sessions have no Match Events.
   */
  sessions: number;
}

const ORDINAL_RULES = new Intl.PluralRules("en-GB", { type: "ordinal" });
const ORDINAL_SUFFIX: Record<string, string> = {
  one: "st",
  two: "nd",
  few: "rd",
  other: "th",
};

function standing(rank: number, sessions: number, end: "best" | "worst") {
  const place =
    rank === 1
      ? end
      : `${rank}${ORDINAL_SUFFIX[ORDINAL_RULES.select(rank)] ?? "th"} ${end}`;
  const text = `${place} of ${formatCount(sessions, "session", "sessions")}`;
  return text[0].toUpperCase() + text.slice(1);
}

function meanOf(
  metric: PerformanceMetric,
  club: Club,
  matches: readonly MatchPerformance[],
): number | null {
  return weightedMean(
    withoutNulls(
      matches.map((m) => {
        const totals = m[club];
        return totals ? metric.sample(totals, m.secondsPlayed) : null;
      }),
    ),
  );
}

/**
 * `session`'s Matches against each of `others` (one array of Matches per
 * other Session). Null when the Session is too short or there are too few
 * others of `MIN_SESSION_MATCHES` to rank it among.
 */
export function sessionStandouts(
  session: readonly MatchPerformance[],
  others: readonly (readonly MatchPerformance[])[],
): SessionStandouts | null {
  const compared = others.filter((o) => o.length >= MIN_SESSION_MATCHES);
  if (
    session.length < MIN_SESSION_MATCHES ||
    compared.length < MIN_OTHER_SESSIONS
  ) {
    return null;
  }
  const everyOther = compared.flat();
  const found: { end: "well" | "badly"; standout: SessionStandout }[] = [];
  for (const metric of [...PERFORMANCE_METRICS, ...DETAIL_METRICS]) {
    const better = BETTER[metric.id];
    if (!better) continue;
    for (const club of CLUBS) {
      const value = meanOf(metric, club, session);
      const usual = meanOf(metric, club, everyOther);
      const theirs = withoutNulls(compared.map((o) => meanOf(metric, club, o)));
      if (
        value === null ||
        usual === null ||
        theirs.length < MIN_OTHER_SESSIONS
      ) {
        continue;
      }
      const text = { value: metric.format(value), usual: metric.format(usual) };
      if (text.value === text.usual) continue;
      const sessions = theirs.length + 1;
      const cutoff = Math.max(1, Math.floor(sessions / STANDOUT_FRACTION));
      // More of it is good for us when we do a good thing, or they do a bad one.
      const moreIsGood = (club === "ours") === (better === "higher");
      // A tie counts against the rank at both ends: a Session with no red
      // cards, like most of them, is not our best for red cards.
      const above = theirs.filter((v) => v >= value).length;
      const below = theirs.filter((v) => v <= value).length;
      const fromBest = (moreIsGood ? above : below) + 1;
      const fromWorst = (moreIsGood ? below : above) + 1;
      const end = fromBest <= cutoff ? "well" : fromWorst <= cutoff && "badly";
      if (!end) continue;
      const rank = end === "well" ? fromBest : fromWorst;
      found.push({
        end,
        standout: {
          id: `${club}-${metric.id}`,
          label: statName(club, metric.label),
          ...text,
          rank,
          standing: standing(rank, sessions, end === "well" ? "best" : "worst"),
        },
      });
    }
  }
  const top = (end: "well" | "badly") =>
    found
      .filter((f) => f.end === end)
      .map((f) => f.standout)
      // The sort is stable, so ties keep the table order.
      .sort((a, b) => a.rank - b.rank)
      .slice(0, TOP_STANDOUTS);
  return {
    well: top("well"),
    badly: top("badly"),
    sessions: compared.length + 1,
  };
}
