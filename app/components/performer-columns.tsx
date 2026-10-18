import { formatDecimal } from "~/lib/number-format";
import type { LeaderboardRow } from "~/stats/squad";

import { type DataTableColumn, numberColumn } from "./data-table";

/**
 * A leaderboard of Squad Members over some Matches (an Opponent's, a
 * Session's): Appearances, G, A, G+A, average rating and MOTM, with Former
 * Squad Members labelled.
 */
export const PERFORMER_COLUMNS: DataTableColumn<LeaderboardRow>[] = [
  {
    id: "name",
    header: "Squad Member",
    cell: (p) => (
      <span className="inline-flex items-baseline gap-2">
        {p.name}
        {p.former && (
          <span className="font-normal text-ink-muted text-xs">Former</span>
        )}
      </span>
    ),
    sortValue: (p) => p.name,
    firstSort: "asc",
  },
  numberColumn("appearances", "Apps", (p) => p.appearances),
  numberColumn("goals", "G", (p) => p.goals),
  numberColumn("assists", "A", (p) => p.assists),
  numberColumn("goalContributions", "G+A", (p) => p.goalContributions),
  numberColumn(
    "averageRating",
    "Rating",
    (p) => p.averageRating,
    formatDecimal,
  ),
  numberColumn("manOfTheMatch", "MOTM", (p) => p.manOfTheMatch),
];
