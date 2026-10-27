import {
  ChartFrame,
  DataTable,
  type DataTableColumn,
  numberColumn,
  SectionHeading,
  WinRateBarChart,
} from "~/components";
import { formatCount, formatPercentage } from "~/lib/number-format";
import {
  type ByOpponentHumans,
  type GroupedResults,
  type HumansGroup,
  MIN_SPLIT_MATCHES,
  MUCH_HUMANS_GAP,
  winRateBucket,
} from "~/stats/outcome-split";

import { hiddenNote, resultColumns } from "./result-groups";

/**
 * "By Opponent humans" (CLUBS-49): Win % and how often either side quit
 * against Opponents fielding each number of human players, against our own
 * numbers, and in bands.
 */
export function HumansSection({ byHumans }: { byHumans: ByOpponentHumans }) {
  const { exact, bands, againstOurs } = byHumans;
  const note = humansNote(byHumans);
  return (
    <section aria-label="By Opponent humans" className="flex flex-col gap-4">
      <SectionHeading
        title="By Opponent humans"
        subtitle="How many humans played for the Opponent: EA lists no AI players. Matches played in brackets; quit rates are DNFs each side left, of the Matches played."
      />
      {note && <p className="text-ink-muted text-sm">{note}</p>}
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
        <HumansPanel
          title="Win % by Opponent humans"
          caption="Results by Opponent humans"
          header="Opponent humans"
          results={exact}
          showHidden={false}
        />
        <HumansPanel
          title="Win % against our numbers"
          subtitle={`The Opponent's humans against our Squad Members playing: much is ${MUCH_HUMANS_GAP} or more apart`}
          caption="Results against our numbers"
          header="Opponent had"
          results={againstOurs}
        />
        <HumansPanel
          title="Win % by band"
          caption="Results by band of Opponent humans"
          header="Opponent humans"
          results={bands}
        />
      </div>
    </section>
  );
}

/** "1 Match without the Opponent's players is left out. Hidden with fewer than 3 Matches: 7 humans (1)." */
function humansNote({ exact, unknown }: ByOpponentHumans): string {
  const notes: string[] = [];
  if (unknown > 0) {
    notes.push(
      `${formatCount(unknown, "Match", "Matches")} without the Opponent's players ${unknown === 1 ? "is" : "are"} left out.`,
    );
  }
  const hidden = hiddenNote(exact);
  if (hidden) notes.push(hidden);
  if (exact.groups.length === 0) {
    notes.push(
      `Each number of humans needs at least ${MIN_SPLIT_MATCHES} Matches to show.`,
    );
  }
  return notes.join(" ");
}

/** One grouping's Win % chart over its table; nothing when no group has enough Matches. */
function HumansPanel({
  title,
  subtitle,
  caption,
  header,
  results,
  showHidden = true,
}: {
  title: string;
  subtitle?: string;
  caption: string;
  /** The table's first column header. */
  header: string;
  results: GroupedResults<HumansGroup>;
  /** Whether to name the hidden groups; the section note already names the exact counts'. */
  showHidden?: boolean;
}) {
  if (results.groups.length === 0) return null;
  const note = showHidden ? hiddenNote(results) : null;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ChartFrame title={title} subtitle={subtitle}>
        <WinRateBarChart
          label={title}
          buckets={results.groups.map((g) => winRateBucket(g.label, g))}
        />
        {note && <p className="mt-3 text-ink-muted text-sm">{note}</p>}
      </ChartFrame>
      <DataTable
        caption={caption}
        columns={humansColumns(header)}
        rows={results.groups}
        rowKey={(g) => g.id}
      />
    </div>
  );
}

/** P/W/D/L and Win %, then how often each side quit. */
function humansColumns(header: string): DataTableColumn<HumansGroup>[] {
  return [
    ...resultColumns<HumansGroup>(header),
    quitColumn("we-quit", "We quit", (g) => [g.weQuitPercentage, g.weQuit]),
    quitColumn("they-quit", "They quit", (g) => [
      g.theyQuitPercentage,
      g.theyQuit,
    ]),
  ];
}

/** A quit rate with its count, "50% (2)", sorted by the rate. */
function quitColumn(
  id: string,
  header: string,
  quits: (g: HumansGroup) => [percentage: number, count: number],
): DataTableColumn<HumansGroup> {
  return {
    ...numberColumn(id, header, (g) => quits(g)[0]),
    cell: (g) => {
      const [percentage, count] = quits(g);
      return `${formatPercentage(percentage)} (${count})`;
    },
  };
}
