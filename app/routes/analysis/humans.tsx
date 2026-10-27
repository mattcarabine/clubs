import {
  ChartFrame,
  DataTable,
  SectionHeading,
  WinRateBarChart,
} from "~/components";
import { formatCount } from "~/lib/number-format";
import {
  type ByOpponentHumans,
  type GroupedResults,
  MIN_SPLIT_MATCHES,
  type ResultGroup,
  winRateBucket,
} from "~/stats/outcome-split";

import { hiddenNote, resultColumns } from "./result-groups";

/**
 * "By Opponent humans" (CLUBS-49): Win % against Opponents fielding each
 * number of human players, in bands, and against our own numbers.
 */
export function HumansSection({ byHumans }: { byHumans: ByOpponentHumans }) {
  const { exact, bands, againstOurs } = byHumans;
  const note = humansNote(byHumans);
  return (
    <section aria-label="By Opponent humans" className="flex flex-col gap-4">
      <SectionHeading
        title="By Opponent humans"
        subtitle="How many humans played for the Opponent: EA lists no AI players. Matches played in brackets."
      />
      {note && <p className="text-ink-muted text-sm">{note}</p>}
      {(exact.groups.length > 0 ||
        bands.groups.length > 0 ||
        againstOurs.groups.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
          <div className="flex min-w-0 flex-col gap-4">
            <HumansChart
              title="Win % by Opponent humans"
              results={exact}
              showHidden={false}
            />
            {exact.groups.length > 0 && (
              <DataTable
                caption="Results by Opponent humans"
                columns={HUMANS_COLUMNS}
                rows={exact.groups}
                rowKey={(g) => g.id}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <HumansChart
              title="Against our numbers"
              subtitle="The Opponent's humans against our Squad Members playing"
              results={againstOurs}
            />
            <HumansChart title="Win % by band" results={bands} />
          </div>
        </div>
      )}
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

function HumansChart({
  title,
  subtitle,
  results,
  showHidden = true,
}: {
  title: string;
  subtitle?: string;
  results: GroupedResults<ResultGroup>;
  /** Whether to name the hidden groups under the chart; the section note already names the exact counts'. */
  showHidden?: boolean;
}) {
  if (results.groups.length === 0) return null;
  const note = showHidden ? hiddenNote(results) : null;
  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <WinRateBarChart
        label={title}
        buckets={results.groups.map((g) => winRateBucket(g.label, g))}
      />
      {note && <p className="mt-3 text-ink-muted text-sm">{note}</p>}
    </ChartFrame>
  );
}

const HUMANS_COLUMNS = resultColumns<ResultGroup>("Opponent humans");
