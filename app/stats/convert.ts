/**
 * Maps the stored values (lower-case, as parsed from EA in `app/ea/parse.ts`)
 * to the display vocabulary in `~/lib/domain`. Query results only ever carry
 * the domain values.
 */
import type { MatchKind, MatchResult, PositionGroup } from "~/ea/parse";
import type {
  MatchType,
  Outcome,
  PositionGroup as PositionGroupName,
} from "~/lib/domain";

const OUTCOMES: Record<MatchResult, Outcome> = {
  win: "W",
  draw: "D",
  loss: "L",
};

const MATCH_TYPES: Record<MatchKind, MatchType | null> = {
  league: "League",
  playoff: "Playoff",
  // Stored, but never shown: every query is scoped with `isShownMatch`.
  friendly: null,
};

const POSITION_GROUPS: Record<PositionGroup, PositionGroupName> = {
  goalkeeper: "Goalkeeper",
  defender: "Defender",
  midfielder: "Midfielder",
  forward: "Forward",
};

/** A stored result, already from Our Club's point of view (Friendlies are scored from the goals at ingest). */
export function toOutcome(result: MatchResult): Outcome {
  return OUTCOMES[result];
}

/** Throws for a Friendly, which a query scoped with `isShownMatch` never returns. */
export function toMatchType(kind: MatchKind): MatchType {
  const type = MATCH_TYPES[kind];
  if (type === null) throw new Error(`Match Type "${kind}" is never shown`);
  return type;
}

export function toMatchKind(type: MatchType): MatchKind {
  return type.toLowerCase() as MatchKind;
}

export function toPositionGroup(
  group: PositionGroup | null,
): PositionGroupName | null {
  return group ? POSITION_GROUPS[group] : null;
}
