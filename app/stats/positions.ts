/**
 * Position Group selections (CLUBS-23): which of a Squad Member's
 * Appearances count, by the Position Group EA reported for each. An empty
 * selection means All Positions.
 *
 * Everything here takes the selection as a parameter rather than reading a
 * URL param, so one page can hold several: the global `?pos=` on the Squad
 * table and profile, and one per player on Compare (`?posA=` / `?posB=`).
 */
import { POSITION_GROUPS, type PositionGroup } from "~/lib/domain";

/** Selected Position Groups in `POSITION_GROUPS` order; empty means All Positions. */
export type PositionGroupSelection = readonly PositionGroup[];

export const ALL_POSITIONS: PositionGroupSelection = [];

/** The label for an empty selection (CONTEXT.md "Position Group"). */
export const ALL_POSITIONS_LABEL = "All Positions";

/**
 * Reads a URL value like `midfielder,forward`, ignoring case, unknown names
 * and repeats. Missing or wholly invalid values give All Positions.
 */
export function parsePositionGroups(
  raw: string | null,
): PositionGroupSelection {
  if (raw === null) return ALL_POSITIONS;
  const wanted = new Set(raw.toLowerCase().split(","));
  return POSITION_GROUPS.filter((group) => wanted.has(group.toLowerCase()));
}

/** The URL value for a selection, or null for All Positions (left out of the URL). */
export function writePositionGroups(
  groups: PositionGroupSelection,
): string | null {
  const canonical = canonicalPositionGroups(groups);
  return canonical.length
    ? canonical.map((group) => group.toLowerCase()).join(",")
    : null;
}

/** Adds or removes one Position Group. Removing the last one gives All Positions. */
export function togglePositionGroup(
  groups: PositionGroupSelection,
  group: PositionGroup,
): PositionGroupSelection {
  return canonicalPositionGroups(
    groups.includes(group)
      ? groups.filter((g) => g !== group)
      : [...groups, group],
  );
}

/**
 * Whether an Appearance in `group` counts under the selection. All Positions
 * counts everything, including Appearances where EA sent no position.
 */
export function inPositionGroups(
  groups: PositionGroupSelection,
  group: PositionGroup | null,
): boolean {
  return groups.length === 0 || (group !== null && groups.includes(group));
}

/** The Appearances (or anything with a `positionGroup`) the selection counts. */
export function filterByPositionGroups<
  Row extends { positionGroup: PositionGroup | null },
>(rows: readonly Row[], groups: PositionGroupSelection): Row[] {
  return rows.filter((row) => inPositionGroups(groups, row.positionGroup));
}

/** "All Positions", or the selected names: "Midfielder or Forward". */
export function describePositionGroups(groups: PositionGroupSelection): string {
  const names = canonicalPositionGroups(groups);
  if (names.length === 0) return ALL_POSITIONS_LABEL;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function canonicalPositionGroups(
  groups: PositionGroupSelection,
): PositionGroup[] {
  return POSITION_GROUPS.filter((group) => groups.includes(group));
}
