/**
 * A Squad Member's profile (CLUBS-10): form charts, the Position Group split
 * and best Matches over the filtered Appearances, plus EA's own season and
 * career totals (CLUBS-19) and build history, which the filter does not touch.
 *
 * The FilterBar's Position Group selection (CLUBS-23) narrows the totals,
 * charts and best Matches; the Position Group split stays whole as the
 * overview and highlights the selection.
 */
import { env } from "cloudflare:workers";
import { data, Link, useSearchParams } from "react-router";

import {
  ChartFrame,
  ChartLegend,
  chipClassName,
  EmptyState,
  FilterBar,
  FormBadge,
  LineChart,
  LondonTime,
  PageHeader,
  RouteError,
  SectionHeading,
  StackedColumnChart,
  StatGrid,
  StatTile,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonShortDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
} from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import {
  comparePath,
  describePositionGroups,
  getPlayerProfile,
  type PositionGroupSelection,
  RECENT_WINDOW,
  statsFilterFromRequest,
} from "~/stats";
import { playerPreview } from "~/stats/link-preview";

import type { Route } from "./+types/route";
import { BestMatches } from "./best-matches";
import { BuildPlate, BuildProgression } from "./build";
import { EaTotals } from "./ea-totals";
import { OutcomeSplitPanel } from "./outcome-split-panel";
import { PositionGroupTable } from "./position-group-table";
import { RecentChangesPanel } from "./recent-changes";

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) {
    return pageMeta({
      title: "A Bloo Bloo — Squad Member not found",
      description: "No Squad Member has this ID.",
      path: location.pathname,
    });
  }
  const { member, totals } = loaderData.profile;
  return pageMeta({
    ...playerPreview(member.name, totals),
    path: location.pathname,
    type: "article",
  });
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteError
      error={error}
      subject="Squad Member"
      notFoundDescription="No Squad Member has this ID. Squad Members appear here after their first Appearance."
      back={{ to: "/squad", children: "Squad" }}
    />
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const filter = statsFilterFromRequest(request);
  const profile = await getPlayerProfile(
    getDb(env.DB),
    params.playerId,
    filter,
    { positionGroups: filter.positionGroups },
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
  const { member, totals, form, build, career, season } = profile;
  const labels = form.map((p) => formatLondonShortDate(p.playedAt));
  const latestBuild = build.at(-1) ?? null;
  const positions = filter.positionGroups;
  // One Position Group would only repeat the tiles above.
  const showPositionGroups = profile.positionGroups.length > 1;

  return (
    <>
      <PageHeader
        title={member.name}
        badge={
          profile.formIndicator && (
            <FormBadge
              status={profile.formIndicator.status}
              detail={profile.formIndicator.text}
            />
          )
        }
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
            Tracking since{" "}
            <LondonTime date={member.trackedSince} format="day" />
            {member.former && (
              <span className="ml-3 bg-shale-800 px-2 py-0.5 text-ink-muted text-sm">
                Former Squad Member
              </span>
            )}
          </>
        }
        aside={
          <div className="flex flex-wrap items-center gap-3">
            <BuildPlate
              build={latestBuild}
              // The usual Position Group, whatever the selection.
              positionGroup={profile.positionGroups[0]?.positionGroup ?? null}
            />
            <CompareLink playerId={member.playerId} />
          </div>
        }
      />

      <FilterBar filter={filter} positions />

      <section aria-label="Tracked totals" className="mb-8">
        <StatGrid>
          <StatTile
            label="Average rating"
            value={formatDecimal(totals.averageRating)}
            trend={form
              .slice(-10)
              .flatMap((p) => (p.rating === null ? [] : [p.rating]))}
            featured
          />
          <StatTile label="Appearances" value={totals.appearances} />
          <StatTile label="Goals + assists" value={totals.goalContributions} />
          <StatTile
            label="Pass completion"
            value={formatPercentage(totals.passPercentage)}
          />
        </StatGrid>
      </section>

      {form.length === 0 ? (
        <div className="mb-8">
          <EmptyState
            title="No Appearances in these filters"
            description={
              positions.length
                ? `No Appearances as ${describePositionGroups(positions)} in these Matches. Pick another Position Group or widen the filters.`
                : "Widen the Match Types or dates to see this Squad Member's form."
            }
          />
        </div>
      ) : (
        <>
          <section aria-label="Recent changes" className="mb-8">
            <SectionHeading
              title="Recent changes"
              subtitle={`The last ${RECENT_WINDOW} Appearances against the ones before${positions.length ? `, as ${describePositionGroups(positions)}` : ""}`}
            />
            <RecentChangesPanel
              name={member.name}
              changes={profile.recentChanges}
            />
          </section>

          <div className="mb-8 grid gap-6 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ChartFrame
                title="Match rating"
                subtitle={`${chartCoverage(form.length, positions)}, with the rolling 5-Match average`}
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
                  formatValue={formatDecimal}
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
                formatValue={formatPercentage}
                height={200}
              />
            </ChartFrame>
          </div>

          <section aria-label="Wins vs Dropped Points" className="mb-8">
            <SectionHeading
              title="Wins vs Dropped Points"
              subtitle={`${chartCoverage(form.length, positions)}: Wins beside draws and losses, per 90 over the minutes played`}
            />
            <OutcomeSplitPanel split={profile.outcomeSplit} />
          </section>
        </>
      )}

      <section aria-label="EA totals" className="mb-8">
        <SectionHeading
          title="EA totals"
          subtitle="EA's own numbers, including Matches from before tracking began"
        />
        <EaTotals
          career={career}
          season={season}
          trackedAppearances={totals.appearances}
        />
      </section>

      <div
        className={`grid gap-6 ${showPositionGroups ? "lg:grid-cols-2" : ""}`}
      >
        {showPositionGroups && (
          <section aria-label="By Position Group" className="min-w-0">
            <SectionHeading title="By Position Group" />
            <PositionGroupTable
              rows={profile.positionGroups}
              selected={positions}
            />
          </section>
        )}
        <section aria-label="Build progression" className="min-w-0">
          <SectionHeading
            title="Build progression"
            subtitle="Overall and position from EA"
          />
          <BuildProgression history={build} />
        </section>
      </div>
    </>
  );
}

/** "Compare to…": this Squad Member as A on the compare page, with the filter carried over. */
function CompareLink({ playerId }: { playerId: string }) {
  const [searchParams] = useSearchParams();
  return (
    <Link
      to={comparePath(searchParams, [playerId])}
      className={`${chipClassName(false)} inline-flex items-center`}
    >
      Compare to…
    </Link>
  );
}

/** The Matches the charts cover: "12 Matches", or "2 Matches as Forward" under a selection. */
function chartCoverage(
  matchCount: number,
  positionGroups: PositionGroupSelection,
): string {
  const matches = formatCount(matchCount, "Match", "Matches");
  return positionGroups.length
    ? `${matches} as ${describePositionGroups(positionGroups)}`
    : matches;
}
