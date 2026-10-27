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
  clubSnapshots,
  formatDroppedCount,
  type GroupSplit,
  getCampaignProgress,
  getOutcomeSplit,
  getWinChanceAnalysis,
  lineupRecords,
  listMatches,
  MIN_SPLIT_MATCHES,
  type PerformanceRow,
  PLAYER_SPLIT_STATS,
  type PlayerSplitRow,
  POSITION_OUTLIER_GAP,
  type PositionOutlier,
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
      "Results and form over time, Wins against draws and defeats, results after a win or a loss, and by Opponent strength and humans.",
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
  return {
    filter,
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
    lineups,
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
        subtitle="How our results move over time, and what changes between Wins and draws or defeats."
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
      <div className="flex flex-col gap-10">
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
          <OutcomeSplitSections {...loaderData} />
        ) : (
          <EmptyState
            title="Not enough Matches yet"
            description={notEnoughMatches(split.record)}
          />
        )}
        {/* Line-ups need only Matches, not a ready Outcome Split. */}
        {record.played > 0 && <LineupsSection lineups={lineups} />}
        <WinChanceSection winChance={winChance} />
        <OverTimeSection skillRating={skillRating} campaigns={campaigns} />
      </div>
    </>
  );
}

/** "…: 2 more Wins and 1 more draw or defeat." */
function notEnoughMatches(record: { wins: number; dropped: number }): string {
  const winsNeeded = MIN_SPLIT_MATCHES - record.wins;
  const droppedNeeded = MIN_SPLIT_MATCHES - record.dropped;
  const needed: string[] = [];
  if (winsNeeded > 0) {
    needed.push(formatCount(winsNeeded, "more Win", "more Wins"));
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
  return `The Outcome Split needs at least ${MIN_SPLIT_MATCHES} Wins and ${formatDroppedCount(MIN_SPLIT_MATCHES)} in these filters: ${needed.join(" and ")}.`;
}

function OutcomeSplitSections({ split, byWeekday, filter }: AnalysisData) {
  const { record } = split;
  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Top findings">
        <SectionHeading
          title="Top findings"
          subtitle={`The biggest differences across ${formatCount(record.wins, "Win", "Wins")} and ${formatDroppedCount(record.dropped)}, ranked by effect size.`}
        />
        {split.findings.length > 0 ? (
          <FindingList findings={split.findings} />
        ) : (
          <EmptyState
            title="No differences yet"
            description="Nothing changes between Wins and draws or defeats in these Matches."
          />
        )}
      </section>

      <section aria-label="Outcome Split">
        <SectionHeading
          title="Outcome Split"
          subtitle={`Averages in Wins against draws and defeats. Counts are per 90 over how long each Match ran.${rageQuitNote(split.rageQuits)}`}
        />
        <DataTable
          caption="Performance in Wins against draws and defeats"
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
          <p className="-mt-2 text-ink-muted text-xs">
            {`A Gap needs at least ${MIN_SPLIT_MATCHES} Matches with and ${MIN_SPLIT_MATCHES} without.`}
          </p>
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
            subtitle="Win % by kick-off and day (London time) and place in a Session. Matches played in brackets."
          />
          <ChartFrame title="By kick-off">
            <WinRateBarChart
              label="Win % by kick-off time"
              buckets={split.byTimeOfDay}
            />
          </ChartFrame>
          <ChartFrame title="By day">
            <WinRateBarChart
              label="Win % by day of the week"
              buckets={byWeekday}
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

      <HumansSection byHumans={split.byHumans} />

      <AfterResultSection splits={split.afterResult} />

      <PlayerSection
        players={split.players}
        positionGroups={filter.positionGroups}
      />
    </div>
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
        subtitle="Win % in the Match after a Win against the Match after a draw or defeat, among the filtered Matches. Matches played in brackets."
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
                  winRateBucket("After a draw or defeat", split.afterDropped),
                ]}
              />
            ) : (
              <p className="text-ink-muted text-sm">
                {`Needs at least ${MIN_SPLIT_MATCHES} Matches after a Win and ${MIN_SPLIT_MATCHES} after a draw or defeat (${split.afterWin.played} and ${split.afterDropped.played} so far).`}
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
        subtitle="Each Squad Member in Wins (W) against draws and defeats (D/L), per 90 over their own minutes. The Position Group applies to this table only."
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
        caption="Squad Members in Wins against draws and defeats"
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

/**
 * " Each side's stats leave out the Matches it rage quit: …", or nothing
 * when no one quit. EA zeroes the quitter's stats (CLUBS-56).
 */
function rageQuitNote(rageQuits: Record<QuitBy, number>): string {
  const sides = [
    rageQuits.us > 0 &&
      `ours in ${formatCount(rageQuits.us, "Match", "Matches")} we rage quit`,
    rageQuits.opponent > 0 &&
      `Opponents' in ${formatCount(rageQuits.opponent, "Match", "Matches")} they rage quit`,
  ].filter(Boolean);
  return sides.length === 0
    ? ""
    : ` EA zeroes the stats of a side that rage quits, so they leave out ${sides.join(" and ")}.`;
}

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
    header: "Opponent in Wins",
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
    numberColumn("gap", "Gap", winRateGap, (gap) =>
      gap === null ? NO_VALUE : `${formatSigned(Math.round(gap))} pts`,
    ),
  ];
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
        `${stat.short} ${side === "wins" ? "W" : "D/L"}`,
        (r) => stat.value(r[side]),
        stat.format,
      ),
    ),
  ),
];
