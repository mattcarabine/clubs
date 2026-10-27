/**
 * Analysis's results over the filtered Matches (from Trends, CLUBS-13, merged
 * by ADR 0008): the record and run of results, the running goal difference,
 * and the rolling goals and Win % Match by Match.
 */
import {
  ChartFrame,
  ChartLegend,
  FormGuide,
  LineChart,
  SectionHeading,
} from "~/components";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatSigned,
} from "~/lib/number-format";
import {
  type RecordSummary,
  type ResultsTimeline,
  ROLLING_WIN_WINDOW,
  ROLLING_WINDOW,
} from "~/stats";

/** The run-of-results strip shows this many of the latest Matches. */
const STRIP_LENGTH = 40;

export function ResultsSection({
  record,
  timeline,
  labels,
}: {
  record: RecordSummary;
  timeline: ResultsTimeline;
  /** One per Match, oldest first. */
  labels: string[];
}) {
  const strip = timeline.outcomes.slice(-STRIP_LENGTH);
  return (
    <section aria-label="Results" className="flex flex-col gap-4">
      <SectionHeading
        title="Results"
        subtitle={`${formatCount(record.played, "match", "matches")}: ${record.wins} won, ${record.draws} drawn, ${record.losses} lost.`}
      />
      <ChartFrame
        title="Run of results"
        subtitle={
          strip.length < record.played
            ? `Latest ${strip.length} of ${record.played} matches, oldest first`
            : "Oldest first"
        }
      >
        <FormGuide results={strip} />
      </ChartFrame>
      <ChartFrame
        title={`${formatSigned(record.goalDifference)} goal difference`}
        subtitle={`Running total: ${record.goalsFor} scored, ${record.goalsAgainst} conceded`}
      >
        <LineChart
          label="Cumulative goal difference"
          labels={labels}
          series={[
            {
              id: "gd",
              label: "Goal difference",
              values: timeline.goalDifference,
            },
          ]}
          formatValue={formatSigned}
        />
      </ChartFrame>
    </section>
  );
}

/** Rolling goals and rolling Win %, side by side on desktop. */
export function RollingSections({
  timeline,
  labels,
  winLabels,
  rollingWinPercentage,
}: {
  timeline: ResultsTimeline;
  labels: string[];
  /** The Outcome Split's Matches, which can differ from `labels`'s. */
  winLabels: string[];
  rollingWinPercentage: number[];
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-6">
      <section aria-label="Goals" className="min-w-0">
        <SectionHeading
          title="Goals"
          subtitle={`Scored and conceded per match, averaged over the ${ROLLING_WINDOW} matches up to each one.`}
        />
        <ChartFrame
          title="Rolling average"
          legend={
            <ChartLegend
              entries={[
                { id: "for", label: "Scored" },
                { id: "against", label: "Conceded" },
              ]}
            />
          }
        >
          <LineChart
            label={`Goals per match, ${ROLLING_WINDOW}-match rolling average`}
            labels={labels}
            series={[
              {
                id: "for",
                label: "Scored",
                values: timeline.rollingGoalsFor,
              },
              {
                id: "against",
                label: "Conceded",
                values: timeline.rollingGoalsAgainst,
              },
            ]}
            formatValue={formatDecimal}
          />
        </ChartFrame>
      </section>
      <section aria-label="Trend" className="min-w-0">
        <SectionHeading
          title="Trend"
          subtitle={`Our win % over the ${ROLLING_WIN_WINDOW} matches up to each one, so you can see form rise and fall.`}
        />
        <ChartFrame title={`Rolling ${ROLLING_WIN_WINDOW}-match win %`}>
          <LineChart
            label={`Rolling ${ROLLING_WIN_WINDOW}-match win %`}
            labels={winLabels}
            series={[
              {
                id: "win",
                label: "Win %",
                values: rollingWinPercentage,
              },
            ]}
            formatValue={formatPercentage}
            formatTick={(v) => `${v}%`}
            reference={{ value: 50, label: "50%" }}
          />
        </ChartFrame>
      </section>
    </div>
  );
}
