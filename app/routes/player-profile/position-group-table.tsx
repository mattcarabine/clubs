import { DataTable, type DataTableColumn, EmptyState } from "~/components";
import type { PositionGroup } from "~/lib/domain";
import { formatDecimal } from "~/lib/number-format";
import type { PositionGroupSplit } from "~/stats";

/** The row header, with a "Main" badge on the Main Position, so the highlight is not colour alone. */
function groupColumn(
  main: PositionGroup | null,
): DataTableColumn<PositionGroupSplit> {
  return {
    id: "group",
    header: "Position Group",
    cell: (r) => (
      <>
        {r.positionGroup ?? "Unknown"}
        {main !== null && r.positionGroup === main && (
          <span className="clip-slant ml-2 bg-rave px-1.5 py-0.5 font-display font-bold text-shale-950 text-xs uppercase tracking-wide [--slant:0.2rem]">
            Main
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
  /** Their Main Position (CLUBS-82), marked; the rows themselves are never filtered. */
  main: PositionGroup | null;
  /** "Main position only" is on, so the Main Position's row is highlighted as the one counted. */
  counted: boolean;
};

/**
 * Appearances, average rating and G+A for each Position Group played: the
 * overview, so it lists every group whatever "Main position only" says,
 * marking the Main Position.
 */
export function PositionGroupTable({
  rows,
  main,
  counted,
}: PositionGroupTableProps) {
  return (
    <DataTable
      caption="By Position Group"
      columns={[groupColumn(main), ...STAT_COLUMNS]}
      rows={rows}
      rowKey={(r) => r.positionGroup ?? "unknown"}
      highlight={(r) => counted && main !== null && r.positionGroup === main}
      empty={
        <EmptyState
          title="No Appearances"
          description="Widen the filters to see where this Squad Member has played."
        />
      }
    />
  );
}
