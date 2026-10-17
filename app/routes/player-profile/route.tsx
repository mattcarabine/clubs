/**
 * A Squad Member's profile (CLUBS-10): form charts, the Position Group split
 * and best Matches over the filtered Appearances, plus EA's own all-time
 * record and build history, which the filter does not touch.
 */
import { env } from "cloudflare:workers";
import { data } from "react-router";

import {
  ChartFrame,
  ChartLegend,
  EmptyState,
  FilterBar,
  LineChart,
  PageHeader,
  SectionHeading,
  StackedColumnChart,
  StatGrid,
  StatTile,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate, formatLondonShortDate } from "~/lib/london-time";
import { getPlayerProfile, statsFilterFromRequest } from "~/stats";

import type { Route } from "./+types/route";
import { AllTimePanel } from "./all-time-panel";
import { BestMatches } from "./best-matches";
import { BuildPlate, BuildProgression } from "./build";
import { formatPercent, formatRating } from "./format";
import { PositionGroupTable } from "./position-group-table";

export function meta({ loaderData }: Route.MetaArgs) {
  const name = loaderData?.profile.member.name ?? "Squad Member";
  return [{ title: `A Bloo Bloo — ${name}` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const filter = statsFilterFromRequest(request);
  const profile = await getPlayerProfile(
    getDb(env.DB),
    params.playerId,
    filter,
  );
  if (!profile) throw data("Not Found", { status: 404 });
  return { filter, profile };
}

const RATING_SERIES = [
  { id: "rating", label: "Match rating" },
  { id: "rolling", label: "5-Match average" },
] as const;

const CONTRIBUTION_SERIES = [
  { id: "goals", label: "Goals" },
  { id: "assists", label: "Assists" },
] as const;

export default function PlayerProfile({ loaderData }: Route.ComponentProps) {
  const { filter, profile } = loaderData;
  const { member, totals, form, build, career } = profile;
  const labels = form.map((p) => formatLondonShortDate(p.playedAt));
  const latestBuild = build.at(-1) ?? null;

  return (
    <>
      <PageHeader
        title={member.name}
        subtitle={
          <>
            {member.personaName && member.personaName !== member.name && (
              <>
                {member.personaName}
                <span aria-hidden className="mx-2 text-shale-600">
                  /
                </span>
              </>
            )}
            Tracking since {formatLondonDate(member.trackedSince)}
            {member.former && (
              <span className="ml-3 bg-shale-800 px-2 py-0.5 text-ink-muted text-sm">
                Former Squad Member
              </span>
            )}
          </>
        }
        aside={
          <BuildPlate
            build={latestBuild}
            positionGroup={totals.positionGroup}
          />
        }
      />

      <FilterBar filter={filter} />

      <section aria-label="Tracked totals" className="mb-8">
        <StatGrid>
          <StatTile
            label="Average rating"
            value={formatRating(totals.averageRating)}
            trend={form
              .slice(-10)
              .flatMap((p) => (p.rating === null ? [] : [p.rating]))}
            featured
          />
          <StatTile label="Appearances" value={totals.appearances} />
          <StatTile label="Goals + assists" value={totals.goalContributions} />
          <StatTile
            label="Pass completion"
            value={formatPercent(totals.passPercentage)}
          />
        </StatGrid>
      </section>

      {form.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            title="No Appearances in these filters"
            description="Widen the Match Types or dates to see this Squad Member's form."
          />
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ChartFrame
                title="Match rating"
                subtitle="Each Appearance, with the rolling 5-Match average"
                legend={<ChartLegend entries={RATING_SERIES} />}
              >
                <LineChart
                  label="Match rating"
                  labels={labels}
                  series={[
                    {
                      ...RATING_SERIES[0],
                      values: form.map((p) => p.rating),
                    },
                    {
                      ...RATING_SERIES[1],
                      values: form.map((p) => p.ratingRolling),
                    },
                  ]}
                  formatValue={(v) => v.toFixed(1)}
                  height={260}
                />
              </ChartFrame>
            </div>
            <section aria-label="Best Matches" className="min-w-0">
              <SectionHeading title="Best Matches" subtitle="Top 5 by rating" />
              <BestMatches appearances={profile.bestMatches} />
            </section>
          </div>

          <div className="mb-8 grid gap-6 lg:grid-cols-2">
            <ChartFrame
              title="Goal contributions"
              subtitle={`${totals.goals} goals and ${totals.assists} assists, by Appearance`}
              legend={<ChartLegend entries={CONTRIBUTION_SERIES} mark="box" />}
            >
              <StackedColumnChart
                label="Goal contributions"
                labels={labels}
                series={[
                  {
                    ...CONTRIBUTION_SERIES[0],
                    values: form.map((p) => p.goals),
                  },
                  {
                    ...CONTRIBUTION_SERIES[1],
                    values: form.map((p) => p.assists),
                  },
                ]}
              />
            </ChartFrame>
            <ChartFrame
              title="Pass completion"
              subtitle="Passes completed in each Appearance"
            >
              <LineChart
                label="Pass completion"
                labels={labels}
                series={[
                  {
                    id: "pass",
                    label: "Pass %",
                    values: form.map((p) => p.passPercentage),
                  },
                ]}
                formatValue={(v) => `${Math.round(v)}%`}
                height={200}
              />
            </ChartFrame>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="By Position Group" className="min-w-0">
          <SectionHeading title="By Position Group" />
          <PositionGroupTable rows={profile.positionGroups} />
        </section>
        <section aria-label="All-time (EA)" className="min-w-0">
          <SectionHeading title="All-time (EA)" subtitle="Since club founded" />
          <AllTimePanel
            career={career}
            trackedAppearances={totals.appearances}
          />
        </section>
        <section aria-label="Build progression" className="min-w-0">
          <SectionHeading
            title="Build progression"
            subtitle="Overall, play style and position from EA"
          />
          <BuildProgression history={build} />
        </section>
      </div>
    </>
  );
}
