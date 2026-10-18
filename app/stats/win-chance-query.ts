/**
 * Win Chance from D1 (CLUBS-30). The curve is always fitted over every rated
 * Competitive Match (the default filter, whatever the page's), so a Match's
 * Win Chance is the same on every page; the page's filter picks which
 * Matches are plotted, counted against expectation and calibrated.
 */
import type { Db } from "~/db/client";

import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import { listMatches, type MatchSummary } from "./matches";
import { ratingGap } from "./skill-rating";
import {
  type CalibrationBand,
  calibration,
  type MatchWinChance,
  matchWinChance,
  ratedResults,
  type WinChanceModel,
  type WinChancePoint,
  type WinsAgainstExpected,
  winChanceModel,
  winsAgainstExpected,
} from "./win-chance";

/** The curve over every rated Competitive Match. */
async function getWinChanceModel(db: Db): Promise<WinChanceModel> {
  return winChanceModel(
    ratedResults(await listMatches(db, DEFAULT_STATS_FILTER)),
  );
}

export interface WinChanceAnalysis {
  model: WinChanceModel;
  /** The filtered rated Matches, oldest first. */
  points: WinChancePoint[];
  /** Filtered Matches left out because either club's Skill Rating is missing. */
  unrated: number;
  vsExpected: WinsAgainstExpected;
  calibration: CalibrationBand[];
}

/** The Analysis page's Win chance section over the Matches a filter selects. */
export async function getWinChanceAnalysis(
  db: Db,
  filter: StatsFilter,
): Promise<WinChanceAnalysis> {
  const [model, matches] = await Promise.all([
    getWinChanceModel(db),
    listMatches(db, filter, { order: "oldest" }),
  ]);
  const results = ratedResults(matches);
  return {
    model,
    points: results.map((r) => ({ gap: r.gap, won: r.outcome === "W" })),
    unrated: matches.length - results.length,
    vsExpected: winsAgainstExpected(model, results),
    calibration: calibration(model, results),
  };
}

/** A Match's Win Chance before kick-off, or null (with no query) when it is unrated. */
export async function getMatchWinChance(
  db: Db,
  match: Pick<MatchSummary, "skillRatings" | "outcome">,
): Promise<MatchWinChance | null> {
  if (ratingGap(match.skillRatings) === null) return null;
  return matchWinChance(await getWinChanceModel(db), match);
}
