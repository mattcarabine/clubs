/** Line-up records (from Trends, CLUBS-13): who wins together, beside Personnel. */
import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  SectionHeading,
} from "~/components";
import { formatPercentage, formatSigned } from "~/lib/number-format";
import { type LineupRecord, MIN_LINEUP_MATCHES } from "~/stats";

export function LineupsSection({
  lineups,
}: {
  lineups: readonly LineupRecord[];
}) {
  return (
    <section aria-label="Line-ups" className="min-w-0">
      <SectionHeading
        title="Line-ups"
        subtitle={`How each group of squad members gets on together, once they have played ${MIN_LINEUP_MATCHES} matches as a group.`}
      />
      <DataTable
        caption="Line-up performance"
        columns={LINEUP_COLUMNS}
        rows={lineups}
        rowKey={(l) => l.key}
        empty={
          <EmptyState
            title="No regular line-ups"
            description={`A line-up appears once the same squad members have played ${MIN_LINEUP_MATCHES} matches together.`}
          />
        }
      />
    </section>
  );
}

function countColumn(
  id: "played" | "wins" | "draws" | "losses",
  header: string,
): DataTableColumn<LineupRecord> {
  const value = (l: LineupRecord) => l[id];
  return { id, header, align: "right", cell: value, sortValue: value };
}

const LINEUP_COLUMNS: DataTableColumn<LineupRecord>[] = [
  {
    id: "lineup",
    header: "Line-up",
    cell: (l) => (
      <ul className="flex min-w-36 flex-col sm:flex-row sm:flex-wrap sm:gap-x-4">
        {l.names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    ),
  },
  countColumn("played", "P"),
  countColumn("wins", "W"),
  countColumn("draws", "D"),
  countColumn("losses", "L"),
  {
    id: "win",
    header: "Win %",
    align: "right",
    cell: (l) => formatPercentage(l.winPercentage),
    sortValue: (l) => l.winPercentage,
  },
  {
    id: "gd",
    header: "GD",
    align: "right",
    cell: (l) => formatSigned(l.goalDifference),
    sortValue: (l) => l.goalDifference,
  },
];
