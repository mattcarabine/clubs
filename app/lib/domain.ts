/** Shared domain vocabulary (see CONTEXT.md) used by components and stats. */

/** A Match result from Our Club's point of view. */
export type Outcome = "W" | "D" | "L";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  W: "Win",
  D: "Draw",
  L: "Loss",
};

export type MatchType = "League" | "Playoff" | "Friendly";

export type PositionGroup =
  | "Goalkeeper"
  | "Defender"
  | "Midfielder"
  | "Forward";

export const POSITION_GROUP_ABBR: Record<PositionGroup, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};
