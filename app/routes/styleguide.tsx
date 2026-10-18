import { type ReactNode, useState } from "react";
import {
  AiWriteup,
  BarChart,
  CampaignPanel,
  ChartFrame,
  ChartLegend,
  DataTable,
  type DataTableColumn,
  DateRangePicker,
  DnfBadge,
  EmptyState,
  FormBadge,
  FormGuide,
  HeadToHeadBar,
  LastUpdatedBadge,
  LineChart,
  LoadingState,
  OutcomeBadge,
  PageHeader,
  PlayerChip,
  ScoreBar,
  SectionHeading,
  SessionHeader,
  Skeleton,
  SmallSampleTag,
  Sparkline,
  StackedColumnChart,
  StatGrid,
  StatTile,
  StepChart,
  type StepChartPoint,
  Tag,
  Ticker,
  TopPerformersStrip,
} from "~/components";
import {
  type MatchType,
  type Outcome,
  POSITION_GROUP_ABBR,
  type PositionGroup,
} from "~/lib/domain";
import { formatDecimal } from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { type DateRange, dateRangeLabel } from "~/stats/filter";
import type { TopPerformer } from "~/stats/top-performers";
import type { Route } from "./+types/styleguide";

export function meta({ location }: Route.MetaArgs) {
  return [
    ...pageMeta({
      title: "A Bloo Bloo — Styleguide",
      description: "Every A Bloo Bloo component and token, live.",
      path: location.pathname,
    }),
    { name: "robots", content: "noindex" },
  ];
}

// Sample data only: every component here is fed by props, never by a query.
const DIVISION_LEVELS = [
  "Division 5",
  "Division 4",
  "Division 3",
  "Division 2",
  "Division 1",
  "Elite",
];

const DIVISION_STEPS: StepChartPoint[] = [
  { label: "1 Nov", level: 0, note: "Season start" },
  { label: "2 Nov", level: 1, marker: "up", note: "Promotion" },
  { label: "5 Nov", level: 2, marker: "up", note: "Promotion" },
  { label: "9 Nov", level: 1, marker: "down", note: "Relegation" },
  { label: "12 Nov", level: 2, marker: "up", note: "Promotion" },
];

const NOW = new Date("2026-10-17T21:30:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** A hero for each result, including both DNF outcomes, as /styleguide shows them. */
const HERO_STATES: {
  name: string;
  matchType: MatchType;
  outcome: Outcome;
  dnf: boolean;
  score: [number, number];
}[] = [
  {
    name: "Kebab Over6pack",
    matchType: "Playoff",
    outcome: "L",
    dnf: false,
    score: [3, 7],
  },
  {
    name: "Cosmos FC",
    matchType: "League",
    outcome: "D",
    dnf: false,
    score: [2, 2],
  },
  {
    name: "The Oak Tree",
    matchType: "League",
    outcome: "W",
    dnf: true,
    score: [3, 0],
  },
  {
    name: "Real Gravesend Rovers Football Club",
    matchType: "League",
    outcome: "L",
    dnf: true,
    score: [0, 3],
  },
];

const PERFORMER = { goals: 0, assists: 0, manOfTheMatch: false };

const PERFORMERS: TopPerformer[] = [
  {
    ...PERFORMER,
    playerId: "1",
    name: "Kopite Kev",
    goals: 2,
    assists: 1,
    rating: 9.4,
    manOfTheMatch: true,
  },
  { ...PERFORMER, playerId: "2", name: "TrentBoi_99", assists: 2, rating: 8.6 },
  { ...PERFORMER, playerId: "3", name: "nutmeg_nora", goals: 1, rating: 8.1 },
  {
    ...PERFORMER,
    playerId: "4",
    name: "Big Sam Allardyce Fan",
    goals: 1,
    rating: 7.4,
  },
  {
    ...PERFORMER,
    playerId: "5",
    name: "xX_Gloves_Xx",
    assists: 1,
    rating: 7.2,
  },
  { ...PERFORMER, playerId: "6", name: "Jonteeu", assists: 1, rating: null },
];

type SquadRow = {
  name: string;
  positionGroup: PositionGroup;
  apps: number;
  goals: number;
  assists: number;
  rating: number | null;
  passPct: number;
};

const SQUAD: SquadRow[] = [
  {
    name: "TrentBoi_99",
    positionGroup: "Midfielder",
    apps: 42,
    goals: 11,
    assists: 19,
    rating: 7.8,
    passPct: 86,
  },
  {
    name: "Kopite Kev",
    positionGroup: "Forward",
    apps: 40,
    goals: 31,
    assists: 7,
    rating: 8.1,
    passPct: 74,
  },
  {
    name: "xX_Gloves_Xx",
    positionGroup: "Goalkeeper",
    apps: 44,
    goals: 0,
    assists: 1,
    rating: 7.2,
    passPct: 69,
  },
  {
    name: "Big Sam Allardyce Fan",
    positionGroup: "Defender",
    apps: 38,
    goals: 3,
    assists: 4,
    rating: 7.0,
    passPct: 88,
  },
  {
    name: "nutmeg_nora",
    positionGroup: "Midfielder",
    apps: 21,
    goals: 6,
    assists: 9,
    rating: null,
    passPct: 81,
  },
];

const SQUAD_COLUMNS: DataTableColumn<SquadRow>[] = [
  {
    id: "name",
    header: "Squad Member",
    cell: (r) => r.name,
    sortValue: (r) => r.name,
    firstSort: "asc",
  },
  {
    id: "pos",
    header: "Pos",
    cell: (r) => POSITION_GROUP_ABBR[r.positionGroup],
  },
  {
    id: "apps",
    header: "Apps",
    cell: (r) => r.apps,
    sortValue: (r) => r.apps,
    align: "right",
  },
  {
    id: "goals",
    header: "Goals",
    cell: (r) => r.goals,
    sortValue: (r) => r.goals,
    align: "right",
  },
  {
    id: "assists",
    header: "Assists",
    cell: (r) => r.assists,
    sortValue: (r) => r.assists,
    align: "right",
  },
  {
    id: "rating",
    header: "Avg rating",
    cell: (r) => formatDecimal(r.rating),
    sortValue: (r) => r.rating,
    align: "right",
  },
  {
    id: "pass",
    header: "Pass %",
    cell: (r) => `${r.passPct}%`,
    sortValue: (r) => r.passPct,
    align: "right",
  },
];

const MATCH_LABELS = [
  "5 Oct",
  "6 Oct",
  "8 Oct",
  "9 Oct",
  "11 Oct",
  "12 Oct",
  "13 Oct",
  "15 Oct",
  "16 Oct",
  "17 Oct",
];
const GOAL_SERIES = [
  { id: "for", label: "Goals for", values: [2, 3, 1, 4, 2, null, 3, 5, 2, 3] },
  {
    id: "against",
    label: "Goals against",
    values: [1, 1, 2, 0, 2, null, 3, 1, 2, 1],
  },
];

// Several Appearances share a date, so the axis labels each date once.
const APPEARANCE_DATES = [
  "11 Oct",
  "11 Oct",
  "11 Oct",
  "13 Oct",
  "13 Oct",
  "15 Oct",
  "15 Oct",
  "15 Oct",
  "17 Oct",
  "17 Oct",
];
const CONTRIBUTION_SERIES = [
  { id: "goals", label: "Goals", values: [1, 0, 2, 0, 1, 0, 3, 1, 0, 2] },
  { id: "assists", label: "Assists", values: [0, 1, 1, 0, 2, 1, 0, 1, 0, 1] },
];

const SWATCHES = [
  ["shale-950", "Page"],
  ["shale-900", "Panel"],
  ["shale-800", "Raised"],
  ["shale-700", "Line"],
  ["sound-900", "Sound deep"],
  ["sound-700", "Sound"],
  ["sound-300", "Sound light"],
  ["rave", "Rave"],
  ["loss", "Loss"],
  ["stale", "Stale"],
  ["ink", "Ink"],
  ["ink-muted", "Ink muted"],
] as const;

export default function Styleguide() {
  return (
    <div className="grid gap-12">
      <PageHeader
        title="Styleguide"
        subtitle="Every shared component with sample props. Import them from ~/components."
        aside={<LastUpdatedBadge updatedAt={minutesAgo(4)} now={NOW} />}
      />

      <Section id="palette" title="Palette">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {SWATCHES.map(([token, name]) => (
            <li key={token} className="min-w-0 text-sm">
              <span
                className="block h-12 border border-shale-700"
                style={{ background: `var(--color-${token})` }}
              />
              <span className="mt-1 block text-ink">{name}</span>
              <code className="block truncate text-ink-muted text-xs">
                {token}
              </code>
            </li>
          ))}
        </ul>
        <div className="mt-6 grid gap-2">
          <p className="font-display font-extrabold text-6xl text-ink uppercase italic leading-none">
            Full time 3–1
          </p>
          <p className="font-display font-bold text-2xl text-ink-soft uppercase tracking-wide">
            Sofia Sans Extra Condensed, for numerals and names
          </p>
          <p className="max-w-prose text-ink-soft">
            Sofia Sans carries tables and running text. It stays readable at
            small sizes and has tabular figures, so columns of stats line up.
          </p>
        </div>
      </Section>

      <Section id="score-bar" title="ScoreBar">
        <div className="grid gap-10">
          <ScoreBar
            size="hero"
            label="League"
            meta={["Full time", "Sat 17 Oct, 22:30"]}
            outcome="W"
            home={{
              name: "A Bloo Bloo",
              score: 3,
              isOurClub: true,
              detail: "Skill rating 1632",
            }}
            away={{
              name: "Northside Athletic",
              score: 1,
              detail: "Skill rating 1418",
            }}
            stats={[
              { label: "Shots", home: "11", away: "6" },
              { label: "Pass %", home: "83%", away: "72%" },
              { label: "Tackles", home: "14", away: "9" },
            ]}
          />
          {HERO_STATES.map((state) => (
            <ScoreBar
              key={state.name}
              size="hero"
              label={state.matchType}
              meta={[
                state.dnf ? <DnfBadge key="dnf" /> : "Full time",
                "Sat 17 Oct, 22:49",
              ]}
              outcome={state.outcome}
              dnf={state.dnf}
              home={{
                name: "A Bloo Bloo",
                score: state.score[0],
                isOurClub: true,
              }}
              away={{ name: state.name, score: state.score[1] }}
            />
          ))}
          <div className="grid gap-3 lg:grid-cols-2">
            <ScoreBar
              label="Playoff"
              meta={[<DnfBadge key="dnf" />, "Wed 14 Oct, 22:17"]}
              outcome="L"
              home={{ name: "A Bloo Bloo", score: 0, isOurClub: true }}
              away={{ name: "Real Gravesend Rovers Football Club", score: 3 }}
            />
            <ScoreBar
              label="League"
              meta={["Wed 14 Oct, 22:35"]}
              outcome="D"
              home={{ name: "A Bloo Bloo", score: 2, isOurClub: true }}
              away={{ name: "Cosmos FC", score: 2 }}
            />
          </div>
        </div>
      </Section>

      <Section id="top-performers" title="TopPerformersStrip">
        <div className="grid gap-6">
          <TopPerformersStrip performers={PERFORMERS.slice(0, 1)} />
          <TopPerformersStrip performers={PERFORMERS} />
        </div>
      </Section>

      <Section id="head-to-head-bar" title="HeadToHeadBar">
        <div className="grid gap-6">
          <HeadToHeadBar
            size="hero"
            label="Head-to-head"
            status="7 Matches"
            ourClub="A Bloo Bloo"
            opponent="Northside Athletic"
            record={{ wins: 4, draws: 1, losses: 2 }}
          />
          <HeadToHeadBar
            label="Most played"
            status="3 Matches"
            ourClub="A Bloo Bloo"
            opponent="Real Gravesend Rovers Football Club"
            record={{ wins: 0, draws: 1, losses: 2 }}
          />
        </div>
      </Section>

      <Section id="ticker" title="Ticker">
        <Ticker
          label="Latest"
          items={[
            { id: "1", headline: "W 3–1", detail: "vs Northside Athletic" },
            { id: "2", headline: "D 2–2", detail: "vs Cosmos FC" },
            { id: "3", headline: "Kopite Kev", detail: "31 goals this Season" },
            {
              id: "4",
              headline: "L 0–3",
              detail: "vs Real Gravesend Rovers (DNF)",
            },
            { id: "5", headline: "Unbeaten", detail: "in 6 League Matches" },
          ]}
        />
      </Section>

      <Section id="stat-tile" title="StatTile">
        <StatGrid>
          <StatTile
            featured
            label="Win rate"
            value="64%"
            delta={{ text: "+6 pts vs last Season", tone: "positive" }}
            trend={[48, 52, 50, 55, 58, 61, 60, 64]}
          />
          <StatTile
            label="Goals per Match"
            value="2.8"
            delta={{ text: "+0.4 vs last Season", tone: "positive" }}
            trend={[2.1, 2.4, 2.2, 2.6, 3.1, 2.8]}
          />
          <StatTile
            label="Conceded per Match"
            value="1.3"
            delta={{ text: "+0.2 vs last Season", tone: "negative" }}
          />
          <StatTile
            label="Matches"
            value="47"
            delta={{ text: "Same as last Season", tone: "neutral" }}
          />
        </StatGrid>
      </Section>

      <Section id="form-guide" title="FormGuide">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <FormGuide results={["W", "W", "D", "L", "W", "W"]} size="md" />
          <FormGuide results={["L", "D", "W", "W", "W"]} />
          <span className="flex items-center gap-2 text-ink-soft text-sm">
            OutcomeBadge <OutcomeBadge outcome="W" />
          </span>
        </div>
      </Section>

      <Section id="session-header" title="SessionHeader">
        <div className="flex flex-col gap-4">
          <SessionHeader
            to="/styleguide"
            start={minutesAgo(150)}
            end={minutesAgo(30)}
            matchCount={5}
            shownCount={5}
            record={{
              wins: 3,
              draws: 1,
              losses: 1,
              goalsFor: 11,
              goalsAgainst: 6,
            }}
            form={["W", "D", "W", "L", "W"]}
            topPerformer={{
              name: "Kopite Kev",
              appearances: 5,
              goals: 4,
              assists: 2,
              averageRating: 8.1,
              manOfTheMatch: 2,
            }}
            teaser="Three Wins from five, and Kopite Kev was unplayable."
          />
          <SessionHeader
            to="/styleguide"
            start={minutesAgo(60)}
            end={minutesAgo(60)}
            matchCount={3}
            shownCount={1}
            record={{
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 2,
              goalsAgainst: 0,
            }}
            form={["W"]}
            topPerformer={null}
          />
        </div>
      </Section>

      <Section id="ai-writeup" title="AiWriteup">
        <div className="grid gap-4 lg:grid-cols-2">
          <AiWriteup
            label="Session recap"
            writtenAt={minutesAgo(20)}
            text={
              "Three Wins from five and a night Kopite Kev will want framed.\n\nHe scored four, set up two more and took Man of the Match twice. The one blot was a 1-3 loss in the fourth Match, where we had 5 shots to their 14."
            }
          />
          <AiWriteup
            label="Advice for Kopite Kev"
            writtenAt={minutesAgo(20)}
            text="Shoot earlier. Four goals from 9 shots says the finishing is there."
            signOff="The Gaff"
          />
        </div>
      </Section>

      <Section id="campaign-panel" title="CampaignPanel">
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <CampaignPanel
            division="Division 4"
            progress={{
              points: 7,
              pointsTarget: 10,
              chances: { left: 2, total: 3 },
              league: ["W", "D", "L", "W"],
              stage: { kind: "league" },
            }}
          />
          <CampaignPanel
            division="Division 2"
            progress={{
              points: 17,
              pointsTarget: 17,
              chances: { left: 3, total: 3 },
              league: ["W", "W", "W", "D", "W", "W", "D"],
              stage: {
                kind: "promotion-series",
                matches: 4,
                winsNeeded: 4,
                results: ["W", "W"],
              },
            }}
          />
          <CampaignPanel
            division="Division 3"
            progress={{
              points: 5,
              pointsTarget: 13,
              chances: { left: 0, total: 3 },
              league: ["L", "W", "D", "D", "L", "L"],
              stage: { kind: "relegation-match", divisionBelow: "Division 4" },
            }}
          />
          <CampaignPanel division="Division 2">
            <p className="text-ink-soft text-sm">
              Before tracking starts: the Division alone, with a note.
            </p>
          </CampaignPanel>
        </div>
      </Section>

      <Section id="player-chip" title="PlayerChip">
        <div className="flex flex-wrap gap-2">
          <PlayerChip
            name="Kopite Kev"
            positionGroup="Forward"
            stat="31"
            to="/squad"
          />
          <PlayerChip name="TrentBoi_99" positionGroup="Midfielder" />
          <PlayerChip
            name="xX_Gloves_Xx"
            positionGroup="Goalkeeper"
            stat="12 CS"
          />
          <PlayerChip name="Old Timer" positionGroup="Defender" former />
        </div>
      </Section>

      <Section id="last-updated-badge" title="LastUpdatedBadge">
        <div className="flex flex-wrap gap-3">
          <LastUpdatedBadge updatedAt={minutesAgo(0)} now={NOW} />
          <LastUpdatedBadge updatedAt={minutesAgo(4)} now={NOW} />
          <LastUpdatedBadge updatedAt={minutesAgo(95)} now={NOW} />
        </div>
      </Section>

      <Section id="form-badge" title="FormBadge">
        <div className="flex flex-wrap items-center gap-3">
          <FormBadge status="hot" detail="Last 5: 8.1 avg vs 7.3 usual" />
          <FormBadge status="cold" detail="Last 5: 6.4 avg vs 7.2 usual" />
          <FormBadge
            status="hot"
            detail="Last 5: 8.1 avg vs 7.3 usual"
            compact
          />
        </div>
      </Section>

      <Section id="tag" title="Tag">
        <div className="flex flex-wrap gap-3">
          <Tag>Performance</Tag>
          <Tag>Pass %</Tag>
          <SmallSampleTag />
        </div>
      </Section>

      <Section id="data-table" title="DataTable">
        <DataTable
          caption="Squad Members this Season"
          columns={SQUAD_COLUMNS}
          rows={SQUAD}
          rowKey={(r) => r.name}
          initialSort={{ columnId: "goals", direction: "desc" }}
        />
      </Section>

      <Section id="charts" title="Charts">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame
            title="Goals by Match"
            subtitle="Last 10 Competitive Matches"
            legend={<ChartLegend entries={GOAL_SERIES} />}
          >
            <LineChart
              label="Goals for and against by Match"
              labels={MATCH_LABELS}
              series={GOAL_SERIES}
            />
          </ChartFrame>
          <ChartFrame title="Top scorers" subtitle="This Season">
            <BarChart
              label="Goals by Squad Member"
              data={SQUAD.map((r) => ({
                id: r.name,
                label: r.name,
                value: r.goals,
              })).sort((a, b) => b.value - a.value)}
            />
          </ChartFrame>
          <ChartFrame
            title="Goal contributions"
            subtitle="Goals and assists by Appearance"
            legend={<ChartLegend entries={CONTRIBUTION_SERIES} mark="box" />}
          >
            <StackedColumnChart
              label="Goals and assists by Appearance"
              labels={APPEARANCE_DATES}
              series={CONTRIBUTION_SERIES}
            />
          </ChartFrame>
          <ChartFrame
            title="Division timeline"
            subtitle="Each Season start, Promotion and Relegation"
          >
            <StepChart
              label="Division over time"
              levels={DIVISION_LEVELS}
              points={DIVISION_STEPS}
              endLabel="Now"
              markerLabels={{ up: "Promotion", down: "Relegation" }}
            />
          </ChartFrame>
        </div>
        <div className="mt-4 max-w-xs">
          <p className="mb-1 text-ink-soft text-sm">
            Sparkline, as used inside StatTile
          </p>
          <Sparkline
            label="Goals in the last 8 Matches"
            values={[1, 3, 2, 4, 2, 5, 3, 4]}
          />
        </div>
      </Section>

      <Section id="empty-state" title="EmptyState">
        <EmptyState
          title="No Matches yet"
          description="Matches appear here a few minutes after full time, once the next Poll picks them up."
        />
      </Section>

      <Section id="date-range-picker" title="DateRangePicker">
        <DateRangePickerExample />
      </Section>

      <Section id="loading" title="Loading">
        <LoadingState label="Loading Matchday" />
        <div className="mt-4 grid max-w-sm gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Section>
    </div>
  );
}

/** The FilterBar's date picker on its own, applying to local state rather than the URL. */
function DateRangePickerExample() {
  const [range, setRange] = useState<DateRange>({
    kind: "custom",
    from: "2026-10-03",
    to: "2026-10-07",
  });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangePicker
        value={range}
        firstMatchDate="2026-09-20"
        onApply={setRange}
      />
      <p className="text-ink-muted text-sm">
        Applied: {dateRangeLabel(range, NOW)}
      </p>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={`sg-${id}`}
      aria-labelledby={`sg-${id}-title`}
      className="min-w-0"
    >
      <div id={`sg-${id}-title`}>
        <SectionHeading title={title} />
      </div>
      {children}
    </section>
  );
}
