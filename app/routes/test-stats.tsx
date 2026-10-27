/**
 * A test-only page that puts the FilterBar over live stats, so the E2E suite
 * can exercise the stats layer (CLUBS-6) before the real pages exist. It is
 * also the smallest working example of a filtered page. Served only in the
 * `test` Wrangler env and in dev; a 404 everywhere else.
 */
import { env } from "cloudflare:workers";
import { data } from "react-router";

import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  PageHeader,
  ScoreBar,
  SectionHeading,
  StatGrid,
  StatTile,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDateTime } from "~/lib/london-time";
import { pageMeta } from "~/lib/page-meta";
import {
  clubRecord,
  type LeaderboardRow,
  listMatches,
  rageQuitLabel,
  resolveStatsFilter,
  squadLeaderboard,
  statsFilterFromRequest,
} from "~/stats";

import type { Route } from "./+types/test-stats";

export function meta({ location }: Route.MetaArgs) {
  return [
    ...pageMeta({
      title: "A Bloo Bloo — Stats check",
      description: "Test-only check of the shared stats layer.",
      path: location.pathname,
    }),
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (env.TEST_ROUTES !== "1" && !import.meta.env.DEV) {
    throw data("Not Found", { status: 404 });
  }
  const db = getDb(env.DB);
  const filter = await resolveStatsFilter(db, statsFilterFromRequest(request));
  const [record, matches, leaderboard] = await Promise.all([
    clubRecord(db, filter),
    listMatches(db, filter, { limit: 20 }),
    squadLeaderboard(db, filter),
  ]);
  return {
    clubName: env.EA_CLUB_NAME,
    filter,
    record,
    matches,
    leaderboard,
  };
}

const LEADERBOARD_COLUMNS: DataTableColumn<LeaderboardRow>[] = [
  { id: "name", header: "Squad Member", cell: (r) => r.name },
  {
    id: "apps",
    header: "Apps",
    align: "right",
    cell: (r) => r.appearances,
    sortValue: (r) => r.appearances,
  },
  {
    id: "goals",
    header: "Goals",
    align: "right",
    cell: (r) => r.goals,
    sortValue: (r) => r.goals,
  },
];

export default function TestStats({ loaderData }: Route.ComponentProps) {
  const { clubName, filter, record, matches, leaderboard } = loaderData;
  return (
    <>
      <PageHeader
        title="Stats check"
        subtitle="Test page for the stats filters"
      />
      <FilterBar filter={filter} />

      <section aria-label="Record" className="mb-8">
        <StatGrid>
          <StatTile label="Played" value={record.played} featured />
          <StatTile
            label="W-D-L"
            value={`${record.wins}-${record.draws}-${record.losses}`}
          />
          <StatTile
            label="Goals"
            value={`${record.goalsFor}-${record.goalsAgainst}`}
          />
          <StatTile label="Points" value={record.points} />
          <StatTile label="Rage quits" value={record.dnf} />
        </StatGrid>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="Matches">
          <SectionHeading title="Matches" />
          {matches.length === 0 ? (
            <EmptyState
              title="No Matches"
              description="No Matches fit these filters. Widen the Match Types or dates."
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {matches.map((match) => (
                <li key={match.matchId}>
                  <ScoreBar
                    home={{
                      name: clubName,
                      score: match.goalsFor,
                      isOurClub: true,
                    }}
                    away={{
                      name: match.opponent.name,
                      score: match.goalsAgainst,
                    }}
                    label={match.matchType}
                    meta={[
                      rageQuitLabel(match) ??
                        formatLondonDateTime(match.playedAt),
                    ]}
                    outcome={match.outcome}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <SectionHeading title="Squad" />
          <DataTable
            caption="Squad Members"
            columns={LEADERBOARD_COLUMNS}
            rows={leaderboard}
            rowKey={(r) => r.playerId}
            empty={
              <EmptyState
                title="No Squad Members"
                description="No Appearances in these Matches."
              />
            }
          />
        </section>
      </div>
    </>
  );
}
