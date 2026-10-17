import { DataTable, type DataTableColumn, EmptyState } from "~/components";
import type { PositionGroupSplit } from "~/stats";

import { formatRating } from "./format";

const COLUMNS: DataTableColumn<PositionGroupSplit>[] = [
  {
    id: "group",
    header: "Position Group",
    cell: (r) => r.positionGroup ?? "Unknown",
  },
  {
    id: "apps",
    header: "Apps",
    align: "right",
    cell: (r) => r.appearances,
    sortValue: (r) => r.appearances,
  },
  {
    id: "rating",
    header: "Avg rating",
    align: "right",
    cell: (r) => formatRating(r.averageRating),
    sortValue: (r) => r.averageRating,
  },
  {
    id: "ga",
    header: "G+A",
    align: "right",
    cell: (r) => r.goalContributions,
    sortValue: (r) => r.goalContributions,
  },
];

type PositionGroupTableProps = {
  rows: readonly PositionGroupSplit[];
};

/** Appearances, average rating and G+A for each Position Group played. */
export function PositionGroupTable({ rows }: PositionGroupTableProps) {
  return (
    <DataTable
      caption="By Position Group"
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.positionGroup ?? "unknown"}
      empty={
        <EmptyState
          title="No Appearances"
          description="Widen the filters to see where this Squad Member has played."
        />
      }
    />
  );
}
