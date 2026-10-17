/**
 * Skill Rating gaps (CLUBS-29): how much stronger an Opponent was than Our
 * Club at a Match, from both clubs' Skill Ratings at the time. Pure and
 * client-safe.
 */
import type { MatchSkillRatings } from "./matches";

/** How many Skill Rating points apart the clubs must be for an Opponent to count as Stronger or Weaker. */
export const STRENGTH_GAP = 100;

export const OPPONENT_STRENGTHS = [
  { id: "stronger", label: "Stronger" },
  { id: "similar", label: "Similar" },
  { id: "weaker", label: "Weaker" },
] as const;

export type OpponentStrength = (typeof OPPONENT_STRENGTHS)[number]["id"];

/**
 * Our Skill Rating minus the Opponent Rating at a Match: positive when we
 * were the stronger club. Null unless both were rated.
 */
export function ratingGap({
  ours,
  opponent,
}: MatchSkillRatings): number | null {
  return ours === null || opponent === null ? null : ours - opponent;
}

/**
 * The Opponent against Our Club by rating gap: Stronger at `STRENGTH_GAP` or
 * more above ours, Weaker at that much below, Similar within it. Null for an
 * unrated Match.
 */
export function opponentStrength(gap: number | null): OpponentStrength | null {
  if (gap === null) return null;
  if (gap <= -STRENGTH_GAP) return "stronger";
  if (gap >= STRENGTH_GAP) return "weaker";
  return "similar";
}
