/**
 * The Clubs League rules per Division (CLUBS-41), hand-edited. EA publishes
 * none of these numbers: they were measured from one club's match-by-match
 * fan wiki and EA Forums reports (research notes, 2026-10-18). Each value
 * carries its source and confidence, so a wrong one is a one-line fix.
 *
 * Sources:
 *   [W1] oh-dear.fandom.com match logs: FC 25 Seasons 0-9, FC 26 Seasons 1-6, FC 27 Season 1.
 *   [E1] EA FC 25 Clubs Deep Dive (Chances, Relegation Battle).
 *   [F1] EA Forums FC 25 "Clubs format is awful" (17 points then 4 in a row; 5 for Elite).
 *   [F2] EA Forums FC 26 "Glitched Relegation" (19/22 in Division 1; relegated "on zero points").
 *   [F4] EA Forums FC 26 Division 1 to Elite series ("16/22 points to get back on promotion matches").
 *   [F6] EA Forums FC 26 Division 3 ("won 3 out of 4 games... wins required 1").
 *   [F10]/[F11] EA Forums FC 26 Elite: no Points Target, 3 Chances, relegation to Division 1.
 *   [G2] FC 24 guides: every club starts each Season in Division 5.
 *
 * Client-safe: no queries.
 */
import type { Outcome } from "~/lib/domain";

import { POINTS } from "./formulas";

/** EA's `currentDivision`: 1 is Elite, 2 is Division 1, ... 6 is Division 5. */
export type DivisionNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface PromotionSeriesRules {
  /** The most Matches the series can last. */
  matches: number;
  /** Wins needed for Promotion. A draw counts as a non-win. */
  winsNeeded: number;
}

export interface DivisionRules {
  number: DivisionNumber;
  name: string;
  /** Campaign points that start a Promotion Series; null where there is no Promotion (Elite). */
  pointsTarget: number | null;
  promotionSeries: PromotionSeriesRules | null;
  /** Campaign points the next Campaign starts on after a failed Promotion Series. */
  pointsAfterFailedSeries: number | null;
  /** Null where Our Club can't be relegated (Division 5). */
  relegation: {
    /** Campaign points in the Division below after losing the Relegation Match. */
    pointsInDivisionBelow: number;
  } | null;
}

export const DIVISIONS: Record<DivisionNumber, DivisionRules> = {
  1: {
    number: 1,
    name: "Elite",
    // No Points Target and no Promotion: "no trophy, no point target" [F10][F11]. Medium-high.
    pointsTarget: null,
    promotionSeries: null,
    pointsAfterFailedSeries: null,
    // FC 26: lose the Relegation Match and drop to Division 1 [F10][F11]. Medium-high; FC 25 at
    // launch exempted Elite [E1]. Starting points in Division 1 assumed 0, as elsewhere. Low.
    relegation: { pointsInDivisionBelow: 0 },
  },
  2: {
    number: 2,
    name: "Division 1",
    // FC 26: 22 ("16/22", "19/22") [F2][F4]. Medium. FC 25 was 20 [W1].
    pointsTarget: 22,
    // 5 Wins in a row: any draw or loss ends it [W1][F1][F11]. High.
    promotionSeries: { matches: 5, winsNeeded: 5 },
    // FC 26: 16 when the target is 22 ("16/22") [F4]. Medium. FC 25 was target - 3 [W1].
    pointsAfterFailedSeries: 16,
    // Division 2 on zero points after relegation [F2]. Medium-high.
    relegation: { pointsInDivisionBelow: 0 },
  },
  3: {
    number: 3,
    name: "Division 2",
    // 17: 16 never triggers, 17 does in four FC 25 Seasons [W1][F1]. High (FC 25 only).
    pointsTarget: 17,
    // 4 Wins in a row: any draw or loss ends it [W1][F1]. High (FC 25 only).
    promotionSeries: { matches: 4, winsNeeded: 4 },
    // 14 (target - 3): one Win after a failure re-triggers, 15 does not [W1]. Medium.
    pointsAfterFailedSeries: 14,
    // Relegated from Division 2 into Division 3, re-triggered exactly at 13 [W1]. Medium-high.
    relegation: { pointsInDivisionBelow: 0 },
  },
  4: {
    number: 4,
    name: "Division 3",
    // 13: 12 never triggers, 13 does in four FC 25 Seasons [W1]. Medium-high (FC 25 only).
    pointsTarget: 13,
    // 3 Wins of 4 [W1]. Medium-high for FC 25; one FC 26 report suggests all 4 [F6]. Low.
    promotionSeries: { matches: 4, winsNeeded: 3 },
    // About 10 (target - 3): after a failed series, L-L-W re-triggers [W1]. Medium.
    pointsAfterFailedSeries: 10,
    // No clean case of a relegation into Division 4; 0 or very low [W1]. Low.
    relegation: { pointsInDivisionBelow: 0 },
  },
  5: {
    number: 5,
    name: "Division 4",
    // 10: 9 never triggers, 10 does in FC 25 and 4 of 5 FC 26 stints [W1]. High.
    pointsTarget: 10,
    // 2 Wins of 3 (W-W, W-D-W, D-W-W promoted; D-L, W-L-L failed) [W1]. High.
    promotionSeries: { matches: 3, winsNeeded: 2 },
    // 7 (target - 3): one league Win re-triggers [W1]. Medium.
    pointsAfterFailedSeries: 7,
    // Relegated from Division 4 into Division 5, needed a full 7 again [W1]. Medium.
    relegation: { pointsInDivisionBelow: 0 },
  },
  6: {
    number: 6,
    name: "Division 5",
    // 7: 6 did not trigger and 7 did, in all 10 FC 25 stints [W1]. High.
    pointsTarget: 7,
    // Up to 3 Matches, 1 Win needed (L-L-W promoted, L-L-L failed) [W1]. Medium-high.
    promotionSeries: { matches: 3, winsNeeded: 1 },
    // About 4 (target - 3), one observation [W1]. Low.
    pointsAfterFailedSeries: 4,
    // Can't be relegated: nine losses in one stint, no Relegation Match [W1]. High.
    relegation: null,
  },
};

/** Rules shared by every Division. */
export interface LeagueRules {
  chances: number;
  points: Readonly<Record<Outcome, number>>;
  seasonStart: { division: DivisionNumber; points: number };
  pointsAfterPromotion: number;
  chancesAfterRelegationWin: number;
  chancesAfterRelegationDraw: number;
}

export const LEAGUE_RULES: LeagueRules = {
  /** Chances on entering a Campaign; each league loss costs one [E1][W1]. High. */
  chances: 3,
  /** League Match points: W 3, D 1, L 0 [W1]. High. */
  points: POINTS,
  /** Every Season starts every club in Division 5 on 0 points [G2][W1]. High. */
  seasonStart: { division: 6, points: 0 },
  /** Campaign points after Promotion [W1]. High. */
  pointsAfterPromotion: 0,
  /** Chances after winning the Relegation Match: all of them [E1][W1]. High. */
  chancesAfterRelegationWin: 3,
  /** Draw: "chances only partly reset" [E1]; modelled as 1. Low. */
  chancesAfterRelegationDraw: 1,
};

/** EA's `currentDivision` as a Division number, or null when it isn't one. */
export function toDivisionNumber(value: number | null): DivisionNumber | null {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 6
    ? (value as DivisionNumber)
    : null;
}

/** "Division 4", "Elite". */
export function divisionName(division: DivisionNumber): string {
  return DIVISIONS[division].name;
}
