import { type DataTableColumn, numberColumn } from "~/components";
import { formatPercentage } from "~/lib/number-format";
import {
  type GroupedResults,
  MIN_SPLIT_MATCHES,
  type ResultGroup,
} from "~/stats/outcome-split";

/** The group's name, then P, W, D, L and Win %. */
export function resultColumns<G extends ResultGroup>(
  header: string,
): DataTableColumn<G>[] {
  return [
    { id: "group", header, cell: (g) => g.label },
    numberColumn("played", "P", (g) => g.played),
    numberColumn("wins", "W", (g) => g.wins),
    numberColumn("draws", "D", (g) => g.draws),
    numberColumn("losses", "L", (g) => g.losses),
    numberColumn("win", "Win %", (g) => g.winPercentage, formatPercentage),
  ];
}

/** "Hidden with fewer than 3 Matches: Similar (2), Weaker (2).", or null with none hidden. */
export function hiddenNote({
  hidden,
}: Pick<GroupedResults<unknown>, "hidden">): string | null {
  return hidden.length === 0
    ? null
    : `Hidden with fewer than ${MIN_SPLIT_MATCHES} Matches: ${hidden.map((h) => `${h.label} (${h.played})`).join(", ")}.`;
}
