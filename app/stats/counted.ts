/**
 * Gaps in EA's data (CLUBS-48), and the one rule for leaving them out of
 * stats. Two things look like performances but are not:
 *
 * - A player who drops out of a Match is recorded with 0 seconds played and
 *   a 3.0 rating. That Appearance is never counted, anywhere.
 * - In a Match one side rage quit, EA keeps almost nothing for the side
 *   that quit: most of its players show 0 shots and 0/0 passes. Our
 *   Appearances in a Match we quit are left out of every stat, comparison,
 *   baseline, per-90 and best or worst, and so are the Opponent's club
 *   totals in a Match they quit (CLUBS-56). The Match itself still counts
 *   in records and form.
 *
 * Every Rage Quit (EA's DNF) has a side that quit: a DNF loss means we quit,
 * a DNF Win means the Opponent did.
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

/** How the site names who rage quit (CONTEXT.md "Rage Quit"). */
const RAGE_QUIT_LABEL: Record<QuitBy, string> = {
  us: "We rage quit",
  opponent: "They rage quit",
};

/**
 * "We rage quit" or "They rage quit" for a Match one side quit, plain
 * "Rage quit" when EA left it level, and null for a Match played to the end.
 */
export function rageQuitLabel(match: QuitInput): string | null {
  if (!match.dnf) return null;
  const by = quitBy(match);
  return by ? RAGE_QUIT_LABEL[by] : "Rage quit";
}

/** Whether Our Club quit the Match. */
export function weQuit(match: QuitInput): boolean {
  return quitBy(match) === "us";
}

/** Whether one side's stats in a Match count: not when that side rage quit. */
export function countsStatsOf(side: QuitBy, match: QuitInput): boolean {
  return quitBy(match) !== side;
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
  return isPlayedAppearance(a) && countsStatsOf("us", a);
}
