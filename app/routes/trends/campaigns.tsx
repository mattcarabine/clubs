/**
 * The Trends page's Campaign section (CLUBS-41): the current Campaign panel,
 * the Division timeline and the Campaign history. `campaignsView` runs in the
 * loader, so dates are formatted once, in London time, on the server.
 */
import type { ReactNode } from "react";

import {
  CampaignPanel,
  type CampaignPanelProgress,
  type CampaignPanelStage,
  ChartFrame,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FormGuide,
  SectionHeading,
  StepChart,
  type StepChartPoint,
  type StepMarker,
} from "~/components";
import type { Outcome } from "~/lib/domain";
import { formatLondonShortDate } from "~/lib/london-time";
import { NO_VALUE } from "~/lib/number-format";
import {
  CAMPAIGN_OUTCOME_LABEL,
  type Campaign,
  type CampaignOutcome,
  campaignRecord,
  chancesLeft,
  type DivisionEvent,
  divisionTimeline,
} from "~/stats/campaigns";
import type { CampaignProgress } from "~/stats/campaigns-query";
import {
  DIVISIONS,
  type DivisionNumber,
  divisionName,
  LEAGUE_RULES,
} from "~/stats/divisions";

export interface CampaignRow {
  key: string;
  division: string;
  dates: string;
  /** League W-D-L. */
  record: string;
  points: string;
  chancesUsed: number | null;
  outcome: CampaignOutcome;
  series: Outcome[];
}

export interface CampaignsView {
  /** Null before tracking starts and before EA reports a Division. */
  division: string | null;
  /** Null before Campaign tracking starts. */
  progress: CampaignPanelProgress | null;
  inPlayoffs: boolean;
  mismatch: { tracked: string; ea: string } | null;
  timeline: StepChartPoint[];
  /** Newest first. */
  history: CampaignRow[];
}

/** Division 5 at the bottom, Elite at the top. */
const DIVISION_LEVELS = ([6, 5, 4, 3, 2, 1] as const).map(divisionName);
function levelOf(division: DivisionNumber): number {
  return 6 - division;
}

const EVENT_NOTE: Record<DivisionEvent, string> = {
  "season-start": "Season start",
  promotion: "Promotion",
  relegation: "Relegation",
};

const EVENT_MARKER: Record<DivisionEvent, StepMarker | undefined> = {
  "season-start": undefined,
  promotion: "up",
  relegation: "down",
};

export function campaignsView(progress: CampaignProgress): CampaignsView {
  const { campaigns, inPlayoffs, eaDivision, mismatch } = progress;
  const current = campaigns.at(-1);
  const shownDivision = current?.division ?? eaDivision;
  return {
    division: shownDivision ? divisionName(shownDivision) : null,
    progress: current ? panelProgress(current) : null,
    inPlayoffs,
    mismatch: mismatch && {
      tracked: divisionName(mismatch.tracked),
      ea: divisionName(mismatch.ea),
    },
    timeline: divisionTimeline(campaigns).map((step) => ({
      label: formatLondonShortDate(step.at),
      level: levelOf(step.division),
      marker: EVENT_MARKER[step.event],
      note: EVENT_NOTE[step.event],
    })),
    history: campaigns.map(historyRow).reverse(),
  };
}

function panelProgress(campaign: Campaign): CampaignPanelProgress {
  const rules = DIVISIONS[campaign.division];
  const left = chancesLeft(campaign);
  return {
    points: campaign.points,
    pointsTarget: rules.pointsTarget,
    chances: left === null ? null : { left, total: LEAGUE_RULES.chances },
    league: campaign.leagueMatches.map((m) => m.outcome),
    stage: panelStage(campaign),
  };
}

function panelStage(campaign: Campaign): CampaignPanelStage {
  const series = DIVISIONS[campaign.division].promotionSeries;
  if (campaign.stage === "promotion-series" && series) {
    return {
      kind: "promotion-series",
      ...series,
      results: campaign.promotionSeries.map((m) => m.outcome),
    };
  }
  if (campaign.stage === "relegation-match") {
    return {
      kind: "relegation-match",
      divisionBelow: divisionName((campaign.division + 1) as DivisionNumber),
    };
  }
  return { kind: "league" };
}

function historyRow(campaign: Campaign, index: number): CampaignRow {
  const { wins, draws, losses } = campaignRecord(campaign);
  const target = DIVISIONS[campaign.division].pointsTarget;
  const start = formatLondonShortDate(campaign.startedAt);
  const end = campaign.endedAt
    ? formatLondonShortDate(campaign.endedAt)
    : "now";
  return {
    key: String(index),
    division: divisionName(campaign.division),
    dates: start === end ? start : `${start} to ${end}`,
    record: `${wins}-${draws}-${losses}`,
    points:
      target === null
        ? String(campaign.points)
        : `${campaign.points} / ${target}`,
    chancesUsed: campaign.chancesUsed,
    outcome: campaign.outcome,
    series: campaign.promotionSeries.map((m) => m.outcome),
  };
}

export function CampaignSection({ view }: { view: CampaignsView }) {
  const { division, progress, inPlayoffs, mismatch, timeline, history } = view;
  return (
    <section aria-label="Campaign" className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        title="Campaign"
        subtitle="Our Club's League Matches in each Division, from the start of the Season. Not affected by the filters."
      />
      {division === null ? (
        <EmptyState
          title="No Division yet"
          description="The Division appears after the first Poll that records the season leaderboard. Campaign tracking starts at the beginning of next Season."
        />
      ) : (
        <CampaignPanel division={division} progress={progress ?? undefined}>
          {!progress && (
            <Note>
              Campaign tracking starts at the beginning of next Season.
            </Note>
          )}
          {inPlayoffs && (
            <Note>
              Playoffs: League Matches don't count towards a Campaign until next
              Season starts.
            </Note>
          )}
          {mismatch && (
            <Note>
              Campaign tracking may be off: we make it {mismatch.tracked}, EA
              says {mismatch.ea}.
            </Note>
          )}
        </CampaignPanel>
      )}
      {timeline.length > 1 && (
        <ChartFrame
          title="Division timeline"
          subtitle="Each Season start, Promotion and Relegation"
        >
          <StepChart
            label="Division over time"
            levels={DIVISION_LEVELS}
            points={timeline}
            endLabel="Now"
            markerLabels={{ up: "Promotion", down: "Relegation" }}
          />
        </ChartFrame>
      )}
      {history.length > 0 && (
        <DataTable
          caption="Campaign history"
          columns={HISTORY_COLUMNS}
          rows={history}
          rowKey={(row) => row.key}
        />
      )}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="border-sound-300 border-l-2 bg-shale-800 px-3 py-2 text-ink-soft text-sm">
      {children}
    </p>
  );
}

const HISTORY_COLUMNS: DataTableColumn<CampaignRow>[] = [
  { id: "division", header: "Division", cell: (r) => r.division },
  { id: "dates", header: "Dates", cell: (r) => r.dates },
  { id: "record", header: "W-D-L", align: "right", cell: (r) => r.record },
  { id: "points", header: "Points", align: "right", cell: (r) => r.points },
  {
    id: "chances",
    header: "Chances used",
    align: "right",
    cell: (r) => r.chancesUsed ?? NO_VALUE,
  },
  {
    id: "outcome",
    header: "Outcome",
    cell: (r) => CAMPAIGN_OUTCOME_LABEL[r.outcome],
  },
  {
    id: "series",
    header: "Promotion Series",
    cell: (r) =>
      r.series.length > 0 ? <FormGuide results={r.series} /> : NO_VALUE,
  },
];
