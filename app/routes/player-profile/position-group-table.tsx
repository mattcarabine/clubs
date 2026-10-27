import { DataTable, type DataTableColumn, EmptyState } from "~/components";
import { formatDecimal } from "~/lib/number-format";
import type { PositionGroupSelection, PositionGroupSplit } from "~/stats";

/** Whether a row's Position Group is selected; "Unknown" never is. */
function isSelected(
  row: PositionGroupSplit,
  selected: PositionGroupSelection,
): boolean {
  return row.positionGroup !== null && selected.includes(row.positionGroup);
}

/** The row header, with a "Selected" badge so the highlight is not colour alone. */
function groupColumn(
  selected: PositionGroupSelection,
): DataTableColumn<PositionGroupSplit> {
  return {
    id: "group",
    header: "Position Group",
    cell: (r) => (
      <>
        {r.positionGroup ?? "Unknown"}
        {isSelected(r, selected) && (
          <span className="clip-slant ml-2 bg-rave px-1.5 py-0.5 font-display font-bold text-shale-950 text-xs uppercase tracking-wide [--slant:0.2rem]">
            Selected
          </span>
        )}
      </>
    ),
  };
}

const STAT_COLUMNS: DataTableColumn<PositionGroupSplit>[] = [
  {
    id: "apps",
    header: "Played",
    align: "right",
    cell: (r) => r.appearances,
    sortValue: (r) => r.appearances,
  },
  {
    id: "rating",
    header: "Avg rating",
    align: "right",
    cell: (r) => formatDecimal(r.averageRating),
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
  /** The FilterBar's Position Groups, highlighted; the rows themselves are never filtered. */
  selected: PositionGroupSelection;
};

/**
 * Appearances, average rating and G+A for each Position Group played: the
 * overview, so it lists every group whatever the selection, picking out the
 * selected ones.
 */
export function PositionGroupTable({
  rows,
  selected,
}: PositionGroupTableProps) {
  return (
    <DataTable
      caption="By Position Group"
      columns={[groupColumn(selected), ...STAT_COLUMNS]}
      rows={rows}
      rowKey={(r) => r.positionGroup ?? "unknown"}
      highlight={(r) => isSelected(r, selected)}
      empty={
        <EmptyState
          title="No Appearances"
          description="Widen the filters to see where this Squad Member has played."
        />
      }
    />
  );
}
