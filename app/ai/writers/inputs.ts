/** Prompt input shapes shared by the writers. */
import { formatDecimal } from "~/lib/number-format";
import type { AppearanceStats } from "~/stats";

/** One Appearance's stats, from minutes played on, as a prompt shows them. */
export function appearanceStatsInput(
  a: Omit<AppearanceStats, "positionGroup">,
) {
  return {
    minutes: Math.round(a.secondsPlayed / 60),
    goals: a.goals,
    assists: a.assists,
    shots: a.shots,
    passes: `${a.passesMade}/${a.passAttempts}`,
    tackles: `${a.tacklesMade}/${a.tackleAttempts}`,
    rating: formatDecimal(a.rating),
    manOfTheMatch: a.manOfTheMatch,
    ...(a.saves > 0 && { saves: a.saves }),
    ...(a.redCards > 0 && { redCards: a.redCards }),
  };
}
