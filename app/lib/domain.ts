/** Shared domain vocabulary (see CONTEXT.md) used by components and stats. */

/** A Match result from Our Club's point of view. */
export type Outcome = "W" | "D" | "L";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  W: "Win",
  D: "Draw",
  L: "Loss",
};

/**
 * The Match Types the app shows. EA also has Friendlies, which the Poll still
 * stores (ADR 0003) but no page, list, count or stat ever shows.
 */
export type MatchType = "League" | "Playoff";

export type PositionGroup =
  | "Goalkeeper"
  | "Defender"
  | "Midfielder"
  | "Forward";

/** Goalkeeper to Forward: the order every Position Group list and control uses. */
export const POSITION_GROUPS = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
] as const satisfies readonly PositionGroup[];

export const POSITION_GROUP_ABBR: Record<PositionGroup, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};

/** Hot form or Cold form: a Squad Member's last 5 ratings well above or below their usual. */
export type FormStatus = "hot" | "cold";

export const FORM_STATUS_LABEL: Record<FormStatus, string> = {
  hot: "Hot",
  cold: "Cold",
};
