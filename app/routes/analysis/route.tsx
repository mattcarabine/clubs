/**
 * Analysis (CLUBS-25), with Trends merged in (CLUBS-59, ADR 0008). Above the
 * FilterBar, what ignores it: EA's Season snapshot, the current Campaign and
 * the State of the club. Then, over the filtered Matches, results and how they
 * moved (the record, goal difference, rolling goals and Win %), and the
 * Outcome Split: what changes between Wins and Dropped Points ("draws and defeats" in copy), from
 * performance, personnel and circumstances, led by the five biggest
 * differences in plain English. Last, "Over time": the Skill Rating and
 * Division history, unfiltered. The Position Group selection applies only to
 * the per-player table.
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
  numberColumn,
  PageHeader,
  PositionGroupPicker,
  ScrollRail,
  SectionHeading,
  SmallSampleTag,
  WinRateBarChart,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonShortDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatPointsGap,
} from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath } from "~/lib/paths";
import {
  type AfterResultSplit,
  clubSnapshots,
  formatDroppedCount,
  type GroupSplit,
  getCampaignProgress,
  getOutcomeSplit,
  getPeriodComparison,
  getWinChanceAnalysis,
  lineupRecords,
  listMatches,
  MIN_SPLIT_MATCHES,
  type PerformanceRow,
  PLAYER_SPLIT_STATS,
  type PlayerSplitRow,
  POSITION_OUTLIER_GAP,
  type PositionOutlier,
  parseCompareRequest,
  resolveStatsFilter,
  resultsTimeline,
  skillRatingHistory,
  splitByWeekday,
  squadAppearances,
  statsFilterFromRequest,
  summariseClubSnapshots,
  summariseRecord,
  type WithWithout,
  winRateBucket,
  winRateGap,
} from "~/stats";
import type { QuitBy } from "~/stats/counted";
import { parseStatsFilter, writeStatsFilter } from "~/stats/filter";
import type { PositionGroupSelection } from "~/stats/positions";

import type { Route } from "./+types/route";
import { CampaignSection, campaignsView } from "./campaigns";
import { ClubSnapshot } from "./club-snapshot";
import { CompareControl, ComparisonSection } from "./compare";
import { FindingList } from "./findings";
import { HumansSection } from "./humans";
import { LineupsSection } from "./lineups";
import { OverTimeSection } from "./over-time";
import { ResultsSection, RollingSections } from "./results";
import { StrengthSection } from "./strength";
import { WinChanceSection } from "./win-chance";

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Analysis",
    description:
      "Results and form over time, what changes when we win, how we do after a win or a loss, and against stronger opponents.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = await resolveStatsFilter(db, statsFilterFromRequest(request));
  const [
    { playedAt, ...split },
    winChance,
    stateOfTheClub,
    snapshots,
    matches,
    appearances,
    campaign,
  ] = await Promise.all([
    getOutcomeSplit(db, filter, { positionGroups: filter.positionGroups }),
    getWinChanceAnalysis(db, filter),
    latestWriteup(db, "club", CLUB_SUBJECT),
    clubSnapshots(db),
    listMatches(db, filter, { order: "oldest" }),
    // Line-up records count results, so they keep the DNFs we quit.
    squadAppearances(db, filter, { includeQuitMatches: true }),
    getCampaignProgress(db),
  ]);
  if (campaign.mismatch) {
    console.warn("Campaign tracking may be off", campaign.mismatch);
  }
  const skillRating = skillRatingHistory(snapshots);
  const comparison = await getPeriodComparison(
    db,
    filter,
    matches,
    parseCompareRequest(new URL(request.url).searchParams),
    new Date(),
  );
  return {
    filter,
    comparison,
    club: summariseClubSnapshots(snapshots),
    campaigns: campaignsView(campaign),
    record: summariseRecord(matches),
    timeline: resultsTimeline(matches),
    timelineLabels: matches.map((m) => formatLondonShortDate(m.playedAt)),
    byWeekday: splitByWeekday(matches),
    lineups: lineupRecords(appearances),
    skillRating: {
      labels: skillRating.map((p) => formatLondonShortDate(p.takenAt)),
      values: skillRating.map((p) => p.skillRating),
    },
    split,
    winChance,
    stateOfTheClub,
    matchLabels: playedAt.map(formatLondonShortDate),
  };
}

type AnalysisData = Route.ComponentProps["loaderData"];

export default function Analysis({ loaderData }: Route.ComponentProps) {
  const {
    filter,
    club,
    campaigns,
    record,
    timeline,
    timelineLabels,
    byWeekday,
    lineups,
    comparison,
    skillRating,
    split,
    winChance,
    stateOfTheClub,
    matchLabels,
  } = loaderData;
  return (
    <>
      <PageHeader
        title="Analysis"
        subtitle="How our results are going, and what's different when we win."
      />
      {/* EA's totals, the Campaign and the State of the club ignore the filter, so they sit above the FilterBar. */}
      {club && <ClubSnapshot club={club} />}
      <div className="mb-8">
        <CampaignSection view={campaigns} />
      </div>
      {stateOfTheClub && (
        <section aria-label="State of the club" className="mb-8">
          <SectionHeading
            title="State of the club"
            subtitle="Updated after each session, looking back over every match."
          />
          <AiWriteup
            label="State of the club"
            text={stateOfTheClub.text}
            writtenAt={stateOfTheClub.writtenAt}
          />
        </section>
      )}
      <FilterBar filter={filter} />
      {comparison.options && (
        <CompareControl
          options={comparison.options}
          active={comparison.active}
        />
      )}
      <div className="flex flex-col gap-10">
        {comparison.view && <ComparisonSection comparison={comparison.view} />}
        {record.played > 0 && (
          <>
            <ResultsSection
              record={record}
              timeline={timeline}
              labels={timelineLabels}
            />
            <RollingSections
              timeline={timeline}
              labels={timelineLabels}
              winLabels={matchLabels}
              rollingWinPercentage={split.rollingWinPercentage}
            />
          </>
        )}
        {split.ready ? (
          <SplitHeadlines split={split} />
        ) : (
          <EmptyState
            title="Not enough matches yet"
            description={notEnoughMatches(split.record)}
          />
        )}
        {/* Win % by circumstance and Line-ups need only Matches, not a ready Outcome Split. */}
        {record.played > 0 && (
          <>
            {/* A lone Circumstances column would leave half the row empty. */}
            <div
              className={`grid gap-10 lg:gap-x-6 ${split.ready ? "lg:grid-cols-2" : ""}`}
            >
              {split.ready && <PersonnelSection split={split} />}
              <CircumstancesSection split={split} byWeekday={byWeekday} />
            </div>
            <LineupsSection lineups={lineups} />
          </>
        )}
        {split.ready && (
          <SplitDetails split={split} positionGroups={filter.positionGroups} />
        )}
        <WinChanceSection winChance={winChance} />
        <OverTimeSection skillRating={skillRating} campaigns={campaigns} />
      </div>
    </>
  );
}

/** "…: 2 more wins and 1 more draw or defeat." */
function notEnoughMatches(record: { wins: number; dropped: number }): string {
  const winsNeeded = MIN_SPLIT_MATCHES - record.wins;
  const droppedNeeded = MIN_SPLIT_MATCHES - record.dropped;
  const needed: string[] = [];
  if (winsNeeded > 0) {
    needed.push(formatCount(winsNeeded, "more win", "more wins"));
  }
  if (droppedNeeded > 0) {
    needed.push(
      formatCount(
        droppedNeeded,
        "more draw or defeat",
        "more draws or defeats",
      ),
    );
  }
  return `To compare wins with draws and defeats we need at least ${MIN_SPLIT_MATCHES} of each in these filters: ${needed.join(" and ")}.`;
}

type OutcomeSplitData = AnalysisData["split"];

/** The ranked findings and the Wins against draws and defeats table. */
function SplitHeadlines({ split }: { split: OutcomeSplitData }) {
  const { record } = split;
  return (
    <>
      <section aria-label="Top findings">
        <SectionHeading
          title="Top findings"
          subtitle={`What changes most between our ${formatCount(record.wins, "win", "wins")} and ${formatDroppedCount(record.dropped)}, biggest first.`}
        />
        {split.findings.length > 0 ? (
          <FindingList findings={split.findings} />
        ) : (
          <EmptyState
            title="No differences yet"
            description="Nothing stands out between wins and draws or defeats in these matches."
          />
        )}
      </section>

      <section aria-label="Outcome Split">
        <SectionHeading
          title="Wins vs draws and defeats"
          subtitle={`Our averages and the opponent's, when we win and when we don't. Counts are per 90 minutes.${rageQuitNote(split.rageQuits)}`}
        />
        <DataTable
          caption="Performance in wins against draws and defeats"
          columns={PERFORMANCE_COLUMNS}
          rows={split.performance}
          rowKey={(r) => r.id}
        />
      </section>
    </>
  );
}

function PersonnelSection({ split }: { split: OutcomeSplitData }) {
  return (
    <section aria-label="Personnel" className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        title="Who plays"
        subtitle="How often we win with and without each squad member, and by how many of us play."
      />
      <DataTable
        caption="With and without"
        columns={withWithoutColumns}
        rows={split.withWithout}
        rowKey={(r) => r.playerId}
        rowHref={(r) => playerPath(r.playerId)}
      />
      <p className="-mt-2 text-ink-muted text-xs">
        {`Gap is our win % with them minus without them, once there are ${MIN_SPLIT_MATCHES} matches each way.`}
      </p>
      <ChartFrame title="By squad members playing">
        <WinRateBarChart
          label="Win % by squad members playing"
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
  );
}

/** Win % by kick-off, day and place in Session: any Matches will do. */
function CircumstancesSection({
  split,
  byWeekday,
}: {
  split: OutcomeSplitData;
  byWeekday: AnalysisData["byWeekday"];
}) {
  return (
    <section aria-label="Circumstances" className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        title="When we play"
        subtitle="How often we win by kick-off time (UK), day, and how far into a session. Matches played in brackets."
      />
      <ChartFrame title="By kick-off">
        <WinRateBarChart
          label="Win % by kick-off time"
          buckets={split.byTimeOfDay}
        />
      </ChartFrame>
      <ChartFrame title="By day">
        <WinRateBarChart label="Win % by day of the week" buckets={byWeekday} />
      </ChartFrame>
      <ChartFrame
        title="Place in session"
        subtitle="A break of more than 45 minutes starts a new session."
      >
        <WinRateBarChart
          label="Win % by place in session"
          buckets={split.bySessionPlace}
        />
      </ChartFrame>
    </section>
  );
}

/** By Opponent, after a result, and per Squad Member. */
function SplitDetails({
  split,
  positionGroups,
}: {
  split: OutcomeSplitData;
  positionGroups: PositionGroupSelection;
}) {
  return (
    <>
      <StrengthSection byStrength={split.byStrength} />

      <HumansSection byHumans={split.byHumans} />

      <AfterResultSection splits={split.afterResult} />

      <PlayerSection players={split.players} positionGroups={positionGroups} />
    </>
  );
}

/** Win % in the Match after a Win against after a draw or defeat, any next Match and within a Session. */
function AfterResultSection({
  splits,
}: {
  splits: readonly AfterResultSplit[];
}) {
  return (
    <section aria-label="After a result" className="flex flex-col gap-4">
      <SectionHeading
        title="After a result"
        subtitle="Do we bounce back? How often we win the next match after a win, and after a draw or defeat. Matches played in brackets."
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
        {splits.map((split) => (
          <ChartFrame
            key={split.scope}
            title={split.label}
            subtitle={
              split.scope === "same-session"
                ? "Only when the next match is in the same session"
                : "The next match, whenever it was"
            }
          >
            {split.comparable ? (
              <WinRateBarChart
                label={`Win % after a result: ${split.label}`}
                buckets={[
                  winRateBucket("After a win", split.afterWin),
                  winRateBucket("After a draw or defeat", split.afterDropped),
                ]}
              />
            ) : (
              <p className="text-ink-muted text-sm">
                {`Needs at least ${MIN_SPLIT_MATCHES} matches after a win and ${MIN_SPLIT_MATCHES} after a draw or defeat (${split.afterWin.played} and ${split.afterDropped.played} so far).`}
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
        title="Squad members"
        subtitle="How each squad member plays, and how much our results depend on it. The position picker changes this table only."
      />
      <dl
        aria-label="Key"
        className="grid gap-x-4 gap-y-1 text-ink-muted text-sm sm:grid-cols-[auto_1fr]"
      >
        {SQUAD_KEY.map(([term, meaning]) => (
          <div key={term} className="contents">
            <dt className="font-semibold text-ink-soft">{term}</dt>
            <dd className="mb-1 sm:mb-0">{meaning}</dd>
          </div>
        ))}
      </dl>
      <div className="border-shale-700 border-t-2 bg-shale-900">
        <ScrollRail className="px-3 py-3 sm:px-4">
          <PositionGroupPicker
            value={positionGroups}
            onChange={setPositionGroups}
          />
        </ScrollRail>
      </div>
      <DataTable
        caption="Squad Members in Wins against draws and defeats"
        columns={PLAYER_COLUMNS}
        rows={players}
        rowKey={(r) => r.playerId}
        rowHref={(r) => playerPath(r.playerId)}
        initialSort={{ columnId: "swing", direction: "desc" }}
        empty={
          <EmptyState
            title="No appearances"
            description="No squad member played in these positions. Pick another or choose All Positions."
          />
        }
      />
    </section>
  );
}

/**
 * " Leaves out our stats from 1 match we rage quit, …", or nothing when no
 * one quit. EA zeroes the quitter's stats (CLUBS-56).
 */
function rageQuitNote(rageQuits: Record<QuitBy, number>): string {
  const sides = [
    rageQuits.us > 0 &&
      `our stats from ${formatCount(rageQuits.us, "match", "matches")} we rage quit`,
    rageQuits.opponent > 0 &&
      `opponents' stats from ${formatCount(rageQuits.opponent, "match", "matches")} they rage quit`,
  ].filter(Boolean);
  return sides.length === 0
    ? ""
    : ` Leaves out ${sides.join(" and ")}, since EA wipes the stats of a side that rage quits.`;
}

/** What the Squad members table's own stats mean, in plain words. */
const SQUAD_KEY: readonly [string, string][] = [
  [
    "Swing",
    "How much more often we win when they play above their usual level than below it. Big means our results follow their form.",
  ],
  ["Floor", "The rating they hit in 4 of 5 matches. High is reliably good."],
  ["Spread", "How much their ratings go up and down. Low is steady."],
  [
    "W and D/L",
    "Their stats in wins, and in draws and defeats, per 90 minutes.",
  ],
];

const PERFORMANCE_COLUMNS: DataTableColumn<PerformanceRow>[] = [
  { id: "stat", header: "Stat", cell: (r) => r.label },
  { id: "wins", header: "Wins", align: "right", cell: (r) => r.ours.wins },
  {
    id: "dropped",
    header: "Draws and defeats",
    align: "right",
    cell: (r) => r.ours.dropped,
  },
  {
    id: "opp-wins",
    header: "Opponent in wins",
    align: "right",
    cell: (r) => r.opponent.wins,
  },
  {
    id: "opp-dropped",
    header: "Opponent in draws and defeats",
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
    numberColumn("gap", "Gap", winRateGap, formatPointsGap),
  ];
}

/** The Squad Member's name, marking a Former Squad Member. */
function squadMemberColumn<
  T extends { name: string; former: boolean },
>(): DataTableColumn<T> {
  return {
    id: "name",
    header: "Squad member",
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
    header: `In a position (gap ${POSITION_OUTLIER_GAP}+ pts)`,
    cell: (r) => `${r.name} at ${r.positionGroup}`,
  },
  ...splitColumns<PositionOutlier>("at", "otherwise"),
];

/**
 * Swing (CLUBS-70) leads, so a phone shows it beside the name: our Win %
 * when they rate above their own average against below it.
 */
const SWING_COLUMNS: DataTableColumn<PlayerSplitRow>[] = [
  {
    ...numberColumn("swing", "Swing", (r) => r.swing.gap),
    cell: ({ swing }) => (
      <span className="inline-flex flex-col items-end gap-1">
        {formatPointsGap(swing.gap)}
        {swing.smallSample && <SmallSampleTag />}
      </span>
    ),
  },
  numberColumn(
    "swing-above",
    "Win % above avg",
    (r) => r.swing.above.winPercentage,
    formatPercentage,
  ),
  numberColumn(
    "swing-below",
    "Win % below avg",
    (r) => r.swing.below.winPercentage,
    formatPercentage,
  ),
  // Consistency (CLUBS-74): how good on a bad night, and how steady.
  {
    ...numberColumn("floor", "Floor", (r) => r.consistency.floor),
    cell: ({ consistency }) => (
      <span className="inline-flex flex-col items-end gap-1">
        {formatDecimal(consistency.floor)}
        {consistency.smallSample && <SmallSampleTag />}
      </span>
    ),
  },
  numberColumn(
    "spread",
    "Spread",
    (r) => r.consistency.spread,
    (v) => formatDecimal(v, 2),
  ),
];

const PLAYER_COLUMNS: DataTableColumn<PlayerSplitRow>[] = [
  squadMemberColumn(),
  ...SWING_COLUMNS,
  ...PLAYER_SPLIT_STATS.flatMap((stat) =>
    (["wins", "dropped"] as const).map((side) =>
      numberColumn<PlayerSplitRow, number | null>(
        `${stat.id}-${side}`,
        `${stat.short} ${side === "wins" ? "W" : "D/L"}`,
        (r) => stat.value(r[side]),
        stat.format,
      ),
    ),
  ),
];
