/** Prompt input shapes shared by the writers. */
import type { Outcome } from "~/lib/domain";
import { formatDecimal } from "~/lib/number-format";
import {
  type AppearanceStats,
  isPlayedAppearance,
  type MatchAppearance,
  quitBy,
  weQuit,
} from "~/stats";

import { promptClub, promptName } from "../sanitise";

/** How Our Club is named in prompts, as in the house style. */
export const OUR_CLUB = "A Bloo Bloo";

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

/** The Match fields a result needs. */
export interface ResultFields {
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  dnf: boolean;
  opponent: { name: string };
}

/**
 * A Match's result as every prompt gives it (CLUBS-48): the score winner
 * first with who won it, so a defeat is never written our way round, and
 * for a DNF who quit (`quitBy`) rather than the label.
 */
export function resultInput(match: ResultFields) {
  const high = Math.max(match.goalsFor, match.goalsAgainst);
  const low = Math.min(match.goalsFor, match.goalsAgainst);
  const opponent = promptName(match.opponent.name);
  const winner = { W: OUR_CLUB, L: opponent, D: null }[match.outcome];
  return {
    opponent,
    score: winner ? `${high}-${low} to ${winner}` : `${high}-${low} draw`,
    ourGoals: match.goalsFor,
    theirGoals: match.goalsAgainst,
    result: { W: "we won", D: "a draw", L: "we lost" }[match.outcome],
    ...(match.dnf && { quitBy: quitBy(match) }),
  };
}

/**
 * Both line-ups with EA's data gaps taken out (`~/stats` counted.ts): a
 * player who dropped out (no minutes, a 3.0) is named in `droppedOut`
 * without stats, and our side of a DNF we quit is only names, since EA
 * kept almost none of its stats. `endedAtMinute` is when a DNF stopped.
 */
export function lineupInput(
  match: ResultFields & { appearances: readonly MatchAppearance[] },
) {
  const played = match.appearances.filter(isPlayedAppearance);
  const quit = weQuit(match);
  const who = (a: MatchAppearance) => ({
    club: promptClub(a.isOurClub, match.opponent.name),
    name: promptName(a.name),
  });
  const statsFor = (a: MatchAppearance) => ({
    ...who(a),
    positionGroup: a.positionGroup,
    ...appearanceStatsInput(a),
  });
  const droppedOut = match.appearances
    .filter((a) => !isPlayedAppearance(a))
    .map(who);
  return {
    ...(match.dnf && { endedAtMinute: endMinute(played) }),
    appearances: played.filter((a) => !(quit && a.isOurClub)).map(statsFor),
    ...(quit && {
      ourPlayers: played
        .filter((a) => a.isOurClub)
        .map((a) => promptName(a.name)),
    }),
    ...(droppedOut.length > 0 && { droppedOut }),
  };
}

/**
 * Whether `lineupInput` leaves anyone's stats out of a Match: a player who
 * dropped out, or our side of a DNF we quit (`ProseContext.dataGaps`).
 */
export function hasDataGaps(
  match: ResultFields & { appearances: readonly MatchAppearance[] },
): boolean {
  return weQuit(match) || !match.appearances.every(isPlayedAppearance);
}

/**
 * A sentence from `~/stats` with its site labels in football words, so the
 * model isn't handed the labels the house style keeps out of prose.
 */
export function proseLabels(text: string): string {
  return text
    .replace(/\bDropped Points\b/g, "draws and defeats")
    .replace(/\bSquad Members\b/g, "players")
    .replace(/\bSquad Member\b/g, "player");
}

/**
 * The prompt context that shows a writer its recent pieces of one kind,
 * under `recentWriting` (HOUSE_STYLE); nothing when there are none.
 */
export function recentWritingContext(
  name: string,
  pieces: readonly string[],
): { context?: { recentWriting: Record<string, readonly string[]> } } {
  return pieces.length > 0
    ? { context: { recentWriting: { [name]: pieces } } }
    : {};
}

const DAY_MS = 86_400_000;

/** Days from one moment to a later one, e.g. `ProseContext.trackedDays`. */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/** The minute a Match stopped: its longest Appearance. */
function endMinute(appearances: readonly MatchAppearance[]): number {
  return Math.round(
    Math.max(0, ...appearances.map((a) => a.secondsPlayed)) / 60,
  );
}
