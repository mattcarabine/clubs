/**
 * Analysis (CLUBS-25): the Outcome Split. What changes between Wins and
 * Dropped Points, from performance, personnel and circumstances, led by the
 * five biggest differences in plain English. Every number comes from
 * `getOutcomeSplit`; the global FilterBar applies to all of it, and the
 * Position Group selection only to the per-player table.
 */
import { env } from "cloudflare:workers";
import { useSearchParams } from "react-router";

import { CLUB_SUBJECT, latestWriteup } from "~/ai/writeups";
import {
  AiWriteup,
  ChartFrame,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  LineChart,
  numberColumn,
  PageHeader,
  PositionGroupPicker,
  ScrollRail,
  SectionHeading,
  WinRateBarChart,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonShortDate } from "~/lib/london-time";
import {
  formatCount,
  formatPercentage,
  formatSigned,
  NO_VALUE,
} from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath } from "~/lib/paths";
import {
  type AfterResultSplit,
  type GroupSplit,
  getOutcomeSplit,
  getWinChanceAnalysis,
  MIN_SPLIT_MATCHES,
  type PerformanceRow,
  PLAYER_SPLIT_STATS,
  type PlayerSplitRow,
  POSITION_OUTLIER_GAP,
  type PositionOutlier,
  ROLLING_WIN_WINDOW,
  resolveStatsFilter,
  statsFilterFromRequest,
  type WithWithout,
  winRateBucket,
} from "~/stats";
import { parseStatsFilter, writeStatsFilter } from "~/stats/filter";
import type { PositionGroupSelection } from "~/stats/positions";

import type { Route } from "./+types/route";
import { FindingList } from "./findings";
import { StrengthSection } from "./strength";
import { WinChanceSection } from "./win-chance";

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Analysis",
    description:
      "Wins against Dropped Points, results after a win or a loss, and results by Opponent strength.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = await resolveStatsFilter(db, statsFilterFromRequest(request));
  const [{ playedAt, ...split }, winChance, stateOfTheClub] = await Promise.all(
    [
      getOutcomeSplit(db, filter, { positionGroups: filter.positionGroups }),
      getWinChanceAnalysis(db, filter),
      latestWriteup(db, "club", CLUB_SUBJECT),
    ],
  );
  return {
    filter,
    split,
    winChance,
    stateOfTheClub,
    matchLabels: playedAt.map(formatLondonShortDate),
  };
}

type AnalysisData = Route.ComponentProps["loaderData"];

export default function Analysis({ loaderData }: Route.ComponentProps) {
  const { filter, split, winChance, stateOfTheClub } = loaderData;
  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle="What changes between Wins and Dropped Points (draws and losses)."
      />
      {/* Written after the latest Session, whatever the filter, so it sits above the FilterBar. */}
      {stateOfTheClub && (
        <section aria-label="State of the club" className="mb-8">
          <SectionHeading
            title="State of the club"
            subtitle="After the latest Session, across every Competitive Match"
          />
          <AiWriteup
            label="State of the club"
            text={stateOfTheClub.text}
            writtenAt={stateOfTheClub.writtenAt}
          />
        </section>
      )}
      <FilterBar filter={filter} />
      {split.ready ? (
        <OutcomeSplitSections {...loaderData} />
      ) : (
        <EmptyState
          title="Not enough Matches yet"
          description={notEnoughMatches(split.record)}
        />
      )}
      <div className="mt-10">
        <WinChanceSection winChance={winChance} />
      </div>
    </>
  );
}

/** "Needs 2 more Wins and 1 more Dropped Points Match." */
function notEnoughMatches(record: { wins: number; dropped: number }): string {
  const winsNeeded = MIN_SPLIT_MATCHES - record.wins;
  const droppedNeeded = MIN_SPLIT_MATCHES - record.dropped;
  const needed: string[] = [];
  if (winsNeeded > 0) {
    needed.push(formatCount(winsNeeded, "more Win", "more Wins"));
  }
  if (droppedNeeded > 0) {
    needed.push(
      `${formatCount(droppedNeeded, "more Match", "more Matches")} with Dropped Points`,
    );
  }
  return `The Outcome Split needs at least ${MIN_SPLIT_MATCHES} Wins and ${MIN_SPLIT_MATCHES} Dropped Points in these filters: ${needed.join(" and ")}.`;
}

function OutcomeSplitSections({ split, matchLabels, filter }: AnalysisData) {
  const { record } = split;
  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Top findings">
        <SectionHeading
          title="Top findings"
          subtitle={`The biggest differences across ${formatCount(record.wins, "Win", "Wins")} and ${record.dropped} Dropped Points, ranked by effect size.`}
        />
        {split.findings.length > 0 ? (
          <FindingList findings={split.findings} />
        ) : (
          <EmptyState
            title="No differences yet"
            description="Nothing changes between Wins and Dropped Points in these Matches."
          />
        )}
      </section>

      <section aria-label="Outcome Split">
        <SectionHeading
          title="Outcome Split"
          subtitle="Averages in Wins against Dropped Points. Counts are per 90 over how long each Match ran."
        />
        <DataTable
          caption="Performance in Wins and Dropped Points"
          columns={PERFORMANCE_COLUMNS}
          rows={split.performance}
          rowKey={(r) => r.id}
        />
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-x-6">
        <section aria-label="Personnel" className="flex min-w-0 flex-col gap-4">
          <SectionHeading
            title="Personnel"
            subtitle="Win % with and without each Squad Member, and by how many played."
          />
          <DataTable
            caption="With and without"
            columns={withWithoutColumns}
            rows={split.withWithout}
            rowKey={(r) => r.playerId}
            rowHref={(r) => playerPath(r.playerId)}
          />
          <ChartFrame title="By Squad Members playing">
            <WinRateBarChart
              label="Win % by Squad Members playing"
              buckets={split.bySquadSize}
            />
          </ChartFrame>
          {split.positionOutliers.length > 0 && (
            <DataTable
              caption="Position outliers"
              columns={outlierColumns}
              rows={split.positionOutliers}
              rowKey={(r) => `${r.playerId}-${r.positionGroup}`}
            />
          )}
        </section>

        <section
          aria-label="Circumstances"
          className="flex min-w-0 flex-col gap-4"
        >
          <SectionHeading
            title="Circumstances"
            subtitle="Win % by kick-off (London time) and place in a Session. Matches played in brackets."
          />
          <ChartFrame title="By kick-off">
            <WinRateBarChart
              label="Win % by kick-off time"
              buckets={split.byTimeOfDay}
            />
          </ChartFrame>
          <ChartFrame title="Weekday or weekend">
            <WinRateBarChart
              label="Win % on weekdays and weekends"
              buckets={split.byDayType}
            />
          </ChartFrame>
          <ChartFrame
            title="Place in Session"
            subtitle="Matches with no more than 45 minutes between kick-offs"
          >
            <WinRateBarChart
              label="Win % by place in Session"
              buckets={split.bySessionPlace}
            />
          </ChartFrame>
        </section>
      </div>

      <StrengthSection byStrength={split.byStrength} />

      <AfterResultSection splits={split.afterResult} />

      <PlayerSection
        players={split.players}
        positionGroups={filter.positionGroups}
      />

      <section aria-label="Trend">
        <SectionHeading
          title="Trend"
          subtitle={`Win % over the last ${ROLLING_WIN_WINDOW} Matches at each Match.`}
        />
        <ChartFrame title={`Rolling ${ROLLING_WIN_WINDOW}-Match Win %`}>
          <LineChart
            label={`Rolling ${ROLLING_WIN_WINDOW}-Match Win %`}
            labels={matchLabels}
            series={[
              {
                id: "win",
                label: "Win %",
                values: split.rollingWinPercentage,
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

/** Win % in the Match after a Win against after Dropped Points, any next Match and within a Session. */
function AfterResultSection({
  splits,
}: {
  splits: readonly AfterResultSplit[];
}) {
  return (
    <section aria-label="After a result" className="flex flex-col gap-4">
      <SectionHeading
        title="After a result"
        subtitle="Win % in the Match after a Win against the Match after Dropped Points, among the filtered Matches. Matches played in brackets."
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
        {splits.map((split) => (
          <ChartFrame
            key={split.scope}
            title={split.label}
            subtitle={
              split.scope === "same-session"
                ? "Only when the next Match is in the same Session"
                : "The next Match, however long after"
            }
          >
            {split.comparable ? (
              <WinRateBarChart
                label={`Win % after a result: ${split.label}`}
                buckets={[
                  winRateBucket("After a Win", split.afterWin),
                  winRateBucket("After Dropped Points", split.afterDropped),
                ]}
              />
            ) : (
              <p className="text-ink-muted text-sm">
                {`Needs at least ${MIN_SPLIT_MATCHES} Matches after a Win and ${MIN_SPLIT_MATCHES} after Dropped Points (${split.afterWin.played} and ${split.afterDropped.played} so far).`}
              </p>
            )}
          </ChartFrame>
        ))}
      </div>
    </section>
  );
}

function PlayerSection({
  players,
  positionGroups,
}: {
  players: readonly PlayerSplitRow[];
  positionGroups: PositionGroupSelection;
}) {
  const [, setSearchParams] = useSearchParams();
  const setPositionGroups = (next: PositionGroupSelection) =>
    setSearchParams(
      (params) =>
        writeStatsFilter(params, {
          ...parseStatsFilter(params),
          positionGroups: next,
        }),
      { preventScrollReset: true },
    );
  return (
    <section aria-label="Squad Members" className="flex flex-col gap-4">
      <SectionHeading
        title="Squad Members"
        subtitle="Each Squad Member in Wins (W) against Dropped Points (DP), per 90 over their own minutes. The Position Group applies to this table only."
      />
      <div className="border-shale-700 border-t-2 bg-shale-900">
        <ScrollRail className="px-3 py-3 sm:px-4">
          <PositionGroupPicker
            value={positionGroups}
            onChange={setPositionGroups}
          />
        </ScrollRail>
      </div>
      <DataTable
        caption="Squad Members in Wins and Dropped Points"
        columns={PLAYER_COLUMNS}
        rows={players}
        rowKey={(r) => r.playerId}
        rowHref={(r) => playerPath(r.playerId)}
        empty={
          <EmptyState
            title="No Appearances"
            description="No Squad Member played in these Position Groups. Pick another or choose All Positions."
          />
        }
      />
    </section>
  );
}

const PERFORMANCE_COLUMNS: DataTableColumn<PerformanceRow>[] = [
  { id: "stat", header: "Stat", cell: (r) => r.label },
  { id: "wins", header: "Wins", align: "right", cell: (r) => r.ours.wins },
  {
    id: "dropped",
    header: "Dropped Points",
    align: "right",
    cell: (r) => r.ours.dropped,
  },
  {
    id: "opp-wins",
    header: "Opponent in Wins",
    align: "right",
    cell: (r) => r.opponent.wins,
  },
  {
    id: "opp-dropped",
    header: "Opponent in Dropped Points",
    align: "right",
    cell: (r) => r.opponent.dropped,
  },
];

/** Played and Win % in the group and the rest, and the gap between them. */
function splitColumns<T extends GroupSplit>(
  group: string,
  rest: string,
): DataTableColumn<T>[] {
  return [
    numberColumn("group-played", `P ${group}`, (r) => r.group.played),
    numberColumn(
      "group-win",
      `Win % ${group}`,
      (r) => r.group.winPercentage,
      formatPercentage,
    ),
    numberColumn("rest-played", `P ${rest}`, (r) => r.rest.played),
    numberColumn(
      "rest-win",
      `Win % ${rest}`,
      (r) => r.rest.winPercentage,
      formatPercentage,
    ),
    numberColumn("gap", "Gap", winRateGap, (gap) =>
      gap === null ? NO_VALUE : `${formatSigned(Math.round(gap))} pts`,
    ),
  ];
}

function winRateGap({ group, rest }: GroupSplit): number | null {
  return group.winPercentage === null || rest.winPercentage === null
    ? null
    : group.winPercentage - rest.winPercentage;
}

/** The Squad Member's name, marking a Former Squad Member. */
function squadMemberColumn<
  T extends { name: string; former: boolean },
>(): DataTableColumn<T> {
  return {
    id: "name",
    header: "Squad Member",
    cell: (r) => (r.former ? `${r.name} (former)` : r.name),
  };
}

const withWithoutColumns: DataTableColumn<WithWithout>[] = [
  squadMemberColumn(),
  ...splitColumns<WithWithout>("with", "without"),
];

const outlierColumns: DataTableColumn<PositionOutlier>[] = [
  {
    id: "name",
    header: `At Position Group (gap ${POSITION_OUTLIER_GAP}+ pts)`,
    cell: (r) => `${r.name} at ${r.positionGroup}`,
  },
  ...splitColumns<PositionOutlier>("at", "otherwise"),
];

const PLAYER_COLUMNS: DataTableColumn<PlayerSplitRow>[] = [
  squadMemberColumn(),
  ...PLAYER_SPLIT_STATS.flatMap((stat) =>
    (["wins", "dropped"] as const).map((side) =>
      numberColumn<PlayerSplitRow, number | null>(
        `${stat.id}-${side}`,
        `${stat.short} ${side === "wins" ? "W" : "DP"}`,
        (r) => stat.value(r[side]),
        stat.format,
      ),
    ),
  ),
];
