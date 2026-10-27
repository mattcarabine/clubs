import {
  DataTable,
  type DataTableColumn,
  numberColumn,
  SmallSampleTag,
} from "~/components";
import { formatPercentage, formatPointsGap } from "~/lib/number-format";
import {
  PLAYER_SPLIT_STATS,
  type PlayerOutcomeSplit,
  type PlayerSplitStat,
  type PositionGroupWinRecord,
  type Swing,
} from "~/stats/outcome-split";

type OutcomeSplitPanelProps = {
  split: PlayerOutcomeSplit;
  swing: Swing;
};

/**
 * "Wins vs Dropped Points" (CLUBS-25): the Squad Member's stats in Wins
 * beside the same stats in Dropped Points, and the Win % at each Position
 * Group, all following the profile's filters and Position Group selection.
 * The profile shows it only when there are Appearances to split.
 */
export function OutcomeSplitPanel({ split, swing }: OutcomeSplitPanelProps) {
  const statColumns: DataTableColumn<PlayerSplitStat>[] = [
    { id: "stat", header: "Stat", cell: (s) => s.label },
    {
      id: "wins",
      header: "Wins",
      align: "right",
      cell: (s) => s.format(s.value(split.wins)),
    },
    {
      id: "dropped",
      header: "Dropped Points",
      align: "right",
      cell: (s) => s.format(s.value(split.dropped)),
    },
  ];

  return (
    <>
      <SwingLine swing={swing} />
      <div className="grid gap-6 lg:grid-cols-2">
        <DataTable
          caption="Wins against Dropped Points"
          columns={statColumns}
          rows={PLAYER_SPLIT_STATS}
          rowKey={(s) => s.id}
        />
        <DataTable
          caption="Win % at each Position Group"
          columns={POSITION_COLUMNS}
          rows={split.byPositionGroup}
          rowKey={(r) => r.positionGroup ?? "unknown"}
        />
      </div>
    </>
  );
}

/**
 * Swing (CLUBS-70) in a sentence: "We win 70% when they play above their
 * average and 30% when below (a Swing of +40 pts)". Nothing until both sides
 * have enough Matches.
 */
function SwingLine({ swing }: { swing: Swing }) {
  if (swing.gap === null) return null;
  return (
    <p className="mb-4 flex flex-wrap items-center gap-2 text-ink-soft text-sm">
      <span>
        We win {formatPercentage(swing.above.winPercentage)} when they play
        above their average and {formatPercentage(swing.below.winPercentage)}{" "}
        when below (a Swing of{" "}
        <strong className="text-ink">{formatPointsGap(swing.gap)}</strong>).
      </span>
      {swing.smallSample && <SmallSampleTag />}
    </p>
  );
}

const POSITION_COLUMNS: DataTableColumn<PositionGroupWinRecord>[] = [
  {
    id: "group",
    header: "Position Group",
    cell: (r) => r.positionGroup ?? "Unknown",
  },
  numberColumn("played", "Apps", (r) => r.played),
  numberColumn("wins", "Wins", (r) => r.wins),
  numberColumn("win", "Win %", (r) => r.winPercentage, formatPercentage),
];
