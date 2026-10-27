/**
 * A Session (CLUBS-34): one evening's run of Matches, whatever the filter. Its
 * record, its recap once it is over (CLUBS-35), its Matches in order, a
 * leaderboard of the Squad Members who played, the running points across it,
 * and its per-90s beside Our Club's usual.
 */
import { env } from "cloudflare:workers";
import { data, Link } from "react-router";

import { latestWriteup } from "~/ai/writeups";
import {
  AiWriteup,
  BackLink,
  ChartFrame,
  DataTable,
  type DataTableColumn,
  FormGuide,
  LineChart,
  LondonTime,
  MatchScoreBar,
  PageHeader,
  PERFORMER_COLUMNS,
  RouteError,
  SectionHeading,
  SessionRecord,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonTimeSpan } from "~/lib/london-time";
import { formatCount } from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath } from "~/lib/paths";
import { cumulativePoints, getSession, type UsualComparisonRow } from "~/stats";
import { sessionPreview } from "~/stats/link-preview";

import type { Route } from "./+types/session";

export function meta({ loaderData, location }: Route.MetaArgs) {
  if (!loaderData) {
    return pageMeta({
      title: "A Bloo Bloo — Session not found",
      description: "No Session starts with this Match.",
      path: location.pathname,
    });
  }
  // CLUBS-35: pass the AI Session recap here once it lands, as
  // sessionPreview's second argument; its first sentence joins the
  // description, unlabelled.
  return pageMeta({
    ...sessionPreview(loaderData.session),
    path: location.pathname,
    type: "article",
  });
}

export async function loader({ params }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const [session, recap] = await Promise.all([
    getSession(db, params.sessionId),
    latestWriteup(db, "session", params.sessionId),
  ]);
  if (!session) throw data("Session not found", { status: 404 });
  const outcomes = session.matches.map((m) => m.outcome);
  return {
    clubName: env.EA_CLUB_NAME,
    session,
    recap,
    outcomes,
    points: cumulativePoints(outcomes),
  };
}

const USUAL_COLUMNS: DataTableColumn<UsualComparisonRow>[] = [
  { id: "label", header: "Stat", cell: (row) => row.label },
  {
    id: "value",
    header: "This Session",
    cell: (row) => row.value,
    align: "right",
  },
  { id: "usual", header: "Usual", cell: (row) => row.usual, align: "right" },
];

export default function Session({ loaderData }: Route.ComponentProps) {
  const { clubName, session, recap, outcomes, points } = loaderData;
  const { matches, record, players, usual } = session;
  return (
    <>
      <BackLink to="/">All Matches</BackLink>
      <PageHeader
        title="Session"
        subtitle={
          <>
            <LondonTime date={session.start} format="day" />,{" "}
            {formatLondonTimeSpan(session.start, session.end)} ·{" "}
            {formatCount(matches.length, "Match", "Matches")}
          </>
        }
      />

      <section
        aria-label="Record"
        className="mb-8 flex flex-col gap-3 border-sound-700 border-t-2 bg-shale-900 p-4"
      >
        <SessionRecord record={record} />
        <FormGuide results={outcomes} size="md" />
      </section>

      {recap && (
        <section aria-label="Recap" className="mb-8">
          <SectionHeading title="Recap" />
          <AiWriteup
            label="Session recap"
            text={recap.text}
            writtenAt={recap.writtenAt}
          />
        </section>
      )}

      <section aria-label="Matches" className="mb-10">
        <SectionHeading
          title="Matches"
          subtitle="In the order they were played"
        />
        <ol className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
          {matches.map((match) => (
            <li key={match.matchId}>
              <Link
                to={`/matches/${match.matchId}`}
                className="block transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-rave focus-visible:outline-offset-4"
              >
                <MatchScoreBar
                  clubName={clubName}
                  match={match}
                  when={<LondonTime date={match.playedAt} format="time" />}
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <section aria-label="Leaderboard" className="min-w-0">
          <SectionHeading
            title="Leaderboard"
            subtitle="Every Squad Member who played in this Session"
          />
          <DataTable
            caption="Session leaderboard"
            columns={PERFORMER_COLUMNS}
            rows={players}
            rowKey={(p) => p.playerId}
            rowHref={(p) => playerPath(p.playerId)}
            initialSort={{ columnId: "goalContributions", direction: "desc" }}
          />
        </section>

        {/* One Match is a one-point chart: say nothing rather than draw it. */}
        {matches.length > 1 && (
          <section aria-label="Session form" className="min-w-0">
            <SectionHeading title="Session form" />
            <ChartFrame
              title={formatCount(record.points, "point", "points")}
              subtitle="Running points, 3 for a Win and 1 for a draw"
            >
              <LineChart
                label="Running points across the Session"
                labels={matches.map((_, i) => `Match ${i + 1}`)}
                series={[{ id: "pts", label: "Points", values: points }]}
                integerTicks
              />
            </ChartFrame>
          </section>
        )}

        {usual && (
          <section aria-label="Compared with your usual" className="min-w-0">
            <SectionHeading
              title="Compared with your usual"
              subtitle="This Session's averages beside every Competitive Match's, per 90 minutes where it says so"
            />
            <DataTable
              caption="This Session against the usual"
              columns={USUAL_COLUMNS}
              rows={usual}
              rowKey={(row) => row.id}
            />
          </section>
        )}
      </div>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <RouteError
      error={error}
      subject="Session"
      notFoundDescription="No Session starts with this Match. It may be older than the first Poll."
      back={{ to: "/", children: "All Matches" }}
    />
  );
}
