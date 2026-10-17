/**
 * Team trends (CLUBS-13): results over time, goals, when we play best,
 * line-up performance and EA's skill rating. Every number comes from the
 * stats layer; the loader formats labels so server and client agree on
 * London time.
 */
import { env } from "cloudflare:workers";

import {
  BarChart,
  ChartFrame,
  ChartLegend,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FormGuide,
  LineChart,
  PageHeader,
  SectionHeading,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonShortDate } from "~/lib/london-time";
import { formatPercent, formatSigned } from "~/lib/number-format";
import {
  clubSnapshots,
  type LineupRecord,
  lineupRecords,
  listMatches,
  MIN_LINEUP_MATCHES,
  ROLLING_WINDOW,
  resultsTimeline,
  type SplitBucket,
  skillRatingHistory,
  splitByKickoffHour,
  splitByWeekday,
  squadAppearances,
  statsFilterFromRequest,
  summariseRecord,
} from "~/stats";

import type { Route } from "./+types/trends";

/** The run-of-results strip shows this many of the latest Matches. */
const STRIP_LENGTH = 40;

export function meta(_: Route.MetaArgs) {
  return [{ title: "A Bloo Bloo — Trends" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = statsFilterFromRequest(request);
  const [matches, appearances, snapshots] = await Promise.all([
    listMatches(db, filter, { order: "oldest" }),
    squadAppearances(db, filter),
    clubSnapshots(db),
  ]);
  const skillRating = skillRatingHistory(snapshots);
  return {
    filter,
    record: summariseRecord(matches),
    matchLabels: matches.map((m) => formatLondonShortDate(m.playedAt)),
    timeline: resultsTimeline(matches),
    byWeekday: splitByWeekday(matches),
    byKickoff: splitByKickoffHour(matches),
    lineups: lineupRecords(appearances),
    skillRating: {
      labels: skillRating.map((p) => formatLondonShortDate(p.takenAt)),
      values: skillRating.map((p) => p.skillRating),
    },
  };
}

export default function Trends({ loaderData }: Route.ComponentProps) {
  const { filter, record, skillRating } = loaderData;
  return (
    <>
      <PageHeader
        title="Trends"
        subtitle="How Our Club's results move over time, and when and with whom we play best."
      />
      <FilterBar filter={filter} />
      <div className="flex flex-col gap-10">
        {record.played === 0 ? (
          <>
            <EmptyState
              title="No Matches to chart"
              description="No Matches fit these filters yet. Widen the Match Types or dates, or check back after the next Poll."
            />
            <SkillRatingSection skillRating={skillRating} />
          </>
        ) : (
          <MatchTrends {...loaderData} />
        )}
      </div>
    </>
  );
}

type TrendsData = Route.ComponentProps["loaderData"];

/** EA's own rating, so it shows even when no Matches fit the filters. */
function SkillRatingSection({ skillRating }: Pick<TrendsData, "skillRating">) {
  return (
    <section aria-label="Skill rating" className="min-w-0">
      <SectionHeading
        title="Skill rating"
        subtitle="EA's club rating each time it changed. Not affected by the filters."
      />
      {skillRating.values.length === 0 ? (
        <EmptyState
          title="No skill rating yet"
          description="The rating appears after the first Poll that records club totals."
        />
      ) : (
        <ChartFrame
          title={`Now ${skillRating.values.at(-1)}`}
          subtitle={skillRatingChange(skillRating.values)}
        >
          <LineChart
            label="Skill rating over time"
            labels={skillRating.labels}
            series={[
              { id: "sr", label: "Skill rating", values: skillRating.values },
            ]}
            includeZero={false}
            formatTick={String}
          />
        </ChartFrame>
      )}
    </section>
  );
}

function MatchTrends({
  record,
  matchLabels,
  timeline,
  byWeekday,
  byKickoff,
  lineups,
  skillRating,
}: TrendsData) {
  const strip = timeline.outcomes.slice(-STRIP_LENGTH);
  return (
    <>
      <section aria-label="Results" className="flex flex-col gap-4">
        <SectionHeading
          title="Results"
          subtitle={`${record.played} ${record.played === 1 ? "Match" : "Matches"}: ${record.wins} won, ${record.draws} drawn, ${record.losses} lost.`}
        />
        <ChartFrame
          title="Run of results"
          subtitle={
            strip.length < record.played
              ? `Latest ${strip.length} of ${record.played} Matches, oldest first`
              : "Oldest first"
          }
        >
          <FormGuide results={strip} />
        </ChartFrame>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame
            title={`${record.points} points`}
            subtitle="Cumulative points, 3 for a win and 1 for a draw"
          >
            <LineChart
              label="Cumulative points"
              labels={matchLabels}
              series={[{ id: "pts", label: "Points", values: timeline.points }]}
            />
          </ChartFrame>
          <ChartFrame
            title={`${formatSigned(record.goalDifference)} goal difference`}
            subtitle={`Running total: ${record.goalsFor} scored, ${record.goalsAgainst} conceded`}
          >
            <LineChart
              label="Cumulative goal difference"
              labels={matchLabels}
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
        </div>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-4">
        <section aria-label="Goals" className="min-w-0">
          <SectionHeading
            title="Goals"
            subtitle={`Goals per Match, averaged over the last ${ROLLING_WINDOW} Matches.`}
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
              label={`Goals per Match, ${ROLLING_WINDOW}-Match rolling average`}
              labels={matchLabels}
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
              formatValue={(v) => v.toFixed(1)}
            />
          </ChartFrame>
        </section>
        <SkillRatingSection skillRating={skillRating} />
      </div>

      <section aria-label="When we win">
        <SectionHeading
          title="When we win"
          subtitle="Win % by day and kick-off hour, London time. Matches played in brackets."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="By day">
            <SplitChart label="Win % by day of the week" buckets={byWeekday} />
          </ChartFrame>
          <ChartFrame title="By kick-off">
            <SplitChart label="Win % by kick-off hour" buckets={byKickoff} />
          </ChartFrame>
        </div>
      </section>

      <section aria-label="Line-ups">
        <SectionHeading
          title="Line-ups"
          subtitle={`Each set of Squad Members who played together, with at least ${MIN_LINEUP_MATCHES} Matches.`}
        />
        <DataTable
          caption="Line-up performance"
          columns={LINEUP_COLUMNS}
          rows={lineups}
          rowKey={(l) => l.key}
          empty={
            <EmptyState
              title="No regular line-ups"
              description={`A line-up appears once the same Squad Members have played ${MIN_LINEUP_MATCHES} Matches together.`}
            />
          }
        />
      </section>
    </>
  );
}

function SplitChart({
  label,
  buckets,
}: {
  label: string;
  buckets: readonly SplitBucket[];
}) {
  return (
    <BarChart
      label={label}
      max={100}
      formatValue={formatPercent}
      data={buckets.map((b) => ({
        id: b.label,
        label: `${b.label} (${b.played})`,
        value: b.winPercentage,
      }))}
    />
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
    cell: (l) => formatPercent(l.winPercentage),
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

function skillRatingChange(values: readonly number[]): string {
  if (values.length < 2) return "One reading so far";
  const change = values[values.length - 1] - values[0];
  return `${formatSigned(change)} since ${values[0]}`;
}
