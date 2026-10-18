/**
 * Gaps in EA's data (CLUBS-48), and the one rule for leaving them out of
 * stats. Two things look like performances but are not:
 *
 * - A player who drops out of a Match is recorded with 0 seconds played and
 *   a 3.0 rating. That Appearance is never counted, anywhere.
 * - In a DNF we quit (a DNF loss), EA keeps almost nothing for our side: most
 *   Squad Members show 0 shots and 0/0 passes. Our Appearances in it are left
 *   out of every stat, comparison, baseline, per-90 and best or worst. The
 *   Match itself still counts in records and form.
 *
 * Every DNF has a side that quit: a DNF loss means we quit, a DNF Win means
 * the Opponent did.
 *
 * Pure and client-safe; the same rules in SQL are `isPlayedAppearanceSql`
 * and `isCountedAppearanceSql` in `scope.ts`.
 */
import type { Outcome } from "~/lib/domain";

/** Who quit a DNF. */
export type QuitBy = "us" | "opponent";

/** The Match fields that say whether, and who, quit. */
export interface QuitInput {
  dnf: boolean;
  outcome: Outcome;
}

/** Who quit a Match, or null for a Match played to the end. */
export function quitBy({ dnf, outcome }: QuitInput): QuitBy | null {
  if (!dnf || outcome === "D") return null;
  return outcome === "L" ? "us" : "opponent";
}

/** Whether Our Club quit the Match. */
export function weQuit(match: QuitInput): boolean {
  return quitBy(match) === "us";
}

/** Whether an Appearance has any minutes: a dropped-out player's has none. */
export function isPlayedAppearance(a: { secondsPlayed: number }): boolean {
  return a.secondsPlayed > 0;
}

/**
 * Whether one of Our Club's Appearances counts towards stats: it has
 * minutes, and is not from a DNF we quit.
 */
export function isCountedAppearance(
  a: { secondsPlayed: number } & QuitInput,
): boolean {
  return isPlayedAppearance(a) && !weQuit(a);
}
