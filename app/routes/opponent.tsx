import { env } from "cloudflare:workers";
import { data, Link } from "react-router";

import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FormGuide,
  HeadToHeadBar,
  LondonTime,
  MatchScoreBar,
  numberColumn,
  PageHeader,
  RouteError,
  SectionHeading,
  StatGrid,
  StatTile,
} from "~/components";
import { getDb } from "~/db/client";
import type { Outcome } from "~/lib/domain";
import { formatLondonDate } from "~/lib/london-time";
import {
  formatCount,
  formatDecimal,
  formatPercentage,
  formatSigned,
} from "~/lib/number-format";
import {
  getOpponent,
  type LeaderboardRow,
  listMatches,
  squadLeaderboard,
  statsFilterFromRequest,
  summariseRecord,
} from "~/stats";

import type { Route } from "./+types/opponent";

/** How many recent results the form strip in the header shows. */
const FORM_LENGTH = 5;
/** Fewer results than this read as a stray badge rather than a run of form. */
const MIN_FORM = 3;

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    {
      title: `A Bloo Bloo — ${loaderData?.opponent.name ?? "Opponent not found"}`,
    },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = statsFilterFromRequest(request);
  const scope = { opponentClubId: params.clubId };
  const [opponent, matches, performers] = await Promise.all([
    getOpponent(db, params.clubId),
    listMatches(db, filter, scope),
    // Everyone who has played them counts, including Former Squad Members.
    squadLeaderboard(db, filter, {
      ...scope,
      minAppearances: 1,
      includeFormer: true,
    }),
  ]);
  if (!opponent) throw data("Not Found", { status: 404 });
  return {
    clubName: env.EA_CLUB_NAME,
    filter,
    opponent,
    matches,
    record: summariseRecord(matches),
    performers,
  };
}

const PERFORMER_COLUMNS: DataTableColumn<LeaderboardRow>[] = [
  {
    id: "name",
    header: "Squad Member",
    cell: (p) => (
      <span className="inline-flex items-baseline gap-2">
        {p.name}
        {p.former && (
          <span className="font-normal text-ink-muted text-xs">Former</span>
        )}
      </span>
    ),
    sortValue: (p) => p.name,
    firstSort: "asc",
  },
  numberColumn("appearances", "Apps", (p) => p.appearances),
  numberColumn("goals", "G", (p) => p.goals),
  numberColumn("assists", "A", (p) => p.assists),
  numberColumn("goalContributions", "G+A", (p) => p.goalContributions),
  numberColumn(
    "averageRating",
    "Rating",
    (p) => p.averageRating,
    formatDecimal,
  ),
  numberColumn("manOfTheMatch", "MOTM", (p) => p.manOfTheMatch),
];

export default function Opponent({ loaderData }: Route.ComponentProps) {
  const { clubName, filter, opponent, matches, record, performers } =
    loaderData;
  const firstMet = matches.at(-1)?.playedAt;
  const form = matches
    .slice(0, FORM_LENGTH)
    .reverse()
    .map((m) => m.outcome);

  return (
    <>
      <PageHeader
        title={opponent.name}
        subtitle={
          firstMet
            ? `Head-to-head since ${formatLondonDate(firstMet)}`
            : "Head-to-head"
        }
        aside={form.length >= MIN_FORM && <OpponentForm results={form} />}
      />
      <FilterBar filter={filter} />

      {matches.length === 0 ? (
        <EmptyState
          title="No Matches against them"
          description="No Matches against this Opponent fit these filters. Widen the Match Types or dates."
          action={
            <Link to="/opponents" className="text-sound-300 hover:underline">
              Back to all Opponents
            </Link>
          }
        />
      ) : (
        <div className="grid gap-8">
          <section aria-label="Head-to-head record" className="grid gap-3">
            <HeadToHeadBar
              size="hero"
              label="Head-to-head"
              status={formatCount(record.played, "Match", "Matches")}
              ourClub={clubName}
              opponent={opponent.name}
              record={record}
            />
            <StatGrid>
              <StatTile
                label="Goal difference"
                value={formatSigned(record.goalDifference)}
                featured
              />
              <StatTile label="Goals for" value={record.goalsFor} />
              <StatTile label="Goals against" value={record.goalsAgainst} />
              <StatTile
                label="Win rate"
                value={formatPercentage(record.winPercentage)}
              />
            </StatGrid>
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <section aria-label="Matches" className="min-w-0">
              <SectionHeading
                title="Matches"
                subtitle="Every meeting, newest first."
              />
              <ol className="flex flex-col gap-4">
                {matches.map((match) => (
                  <li key={match.matchId}>
                    <Link
                      to={`/matches/${match.matchId}`}
                      className="block transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-rave focus-visible:outline-offset-4"
                    >
                      <MatchScoreBar
                        clubName={clubName}
                        match={match}
                        status={
                          <LondonTime date={match.playedAt} format="moment" />
                        }
                      />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            {/* Stays in view beside a long Match list on desktop. */}
            <section
              aria-label="Top performers"
              className="min-w-0 lg:sticky lg:top-24 lg:self-start"
            >
              <SectionHeading
                title="Top performers"
                subtitle="Our Squad Members in these Matches, most goals and assists first."
              />
              <DataTable
                caption="Top performers against them"
                columns={PERFORMER_COLUMNS}
                rows={performers}
                rowKey={(p) => p.playerId}
                rowHref={(p) => `/players/${p.playerId}`}
                initialSort={{
                  columnId: "goalContributions",
                  direction: "desc",
                }}
              />
            </section>
          </div>
        </div>
      )}
    </>
  );
}

/** The last few results against this Opponent, labelled, for the header. */
function OpponentForm({ results }: { results: Outcome[] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-muted text-sm">Form</span>
      <FormGuide results={results} size="md" />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteError
      error={error}
      subject="Opponent"
      notFoundDescription="Our Club has no recorded Match against a club with this ID."
      back={{ to: "/opponents", children: "All Opponents" }}
    />
  );
}
