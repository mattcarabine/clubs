/**
 * Skill Rating gaps (CLUBS-29): how much stronger an Opponent was than Our
 * Club going into a Match, from both clubs' Skill Ratings before kick-off. Pure and
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
 * Our Skill Rating minus the Opponent's before kick-off: positive when we
 * were the stronger club (CLUBS-88). Both stored ratings were read after the
 * Match, so a Win has already pushed ours up and theirs down. Ours before
 * kick-off is a reading of its own (`oursBefore`); the Opponent's is their
 * stored rating with our change taken back out, since what we gained they
 * roughly lost. Null unless all three are known: a gap that already
 * contains the result would bill every Win as expected.
 */
export function ratingGap({
  ours,
  opponent,
  oursBefore,
}: MatchSkillRatings): number | null {
  if (ours === null || opponent === null || oursBefore === null) return null;
  const opponentBefore = opponent + (ours - oursBefore);
  return oursBefore - opponentBefore;
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
