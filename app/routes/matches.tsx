/**
 * The Match list (CLUBS-34): every Match the filter selects, newest first,
 * under a header for its Session, a page of whole Sessions at a time.
 */
import { env } from "cloudflare:workers";
import { Link, useSearchParams } from "react-router";

import {
  EmptyState,
  FilterBar,
  LondonTime,
  MatchScoreBar,
  PageHeader,
  SessionHeader,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate, formatLondonTimeSpan } from "~/lib/london-time";
import { pageMeta } from "~/lib/page-meta";
import { parsePage, withPage } from "~/lib/pagination";
import { sessionPath } from "~/lib/paths";
import {
  listSessionPage,
  type SessionSummary,
  statsFilterFromRequest,
} from "~/stats";

import type { Route } from "./+types/matches";

/** A page holds whole Sessions until it has at least this many Matches. */
const PAGE_SIZE = 20;

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Matches",
    description:
      "Every Match, grouped by Session, with scores, Outcomes and top performers.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = statsFilterFromRequest(request);
  const page = parsePage(new URL(request.url).searchParams);
  const { sessions, pages, total } = await listSessionPage(db, filter, {
    page,
    pageSize: PAGE_SIZE,
  });
  return { clubName: env.EA_CLUB_NAME, filter, sessions, page, pages, total };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { clubName, filter, sessions, page, pages, total } = loaderData;
  const pageLink = usePageLink();
  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${total} ${total === 1 ? "Match" : "Matches"}, newest first`}
      />
      <FilterBar filter={filter} />

      {sessions.length === 0 ? (
        <EmptyState
          title={total === 0 ? "No Matches" : "No Matches on this page"}
          description={
            total === 0
              ? "No Matches fit these filters. Widen the Match Types or dates, or wait for the next Poll."
              : "This page is past the last Match."
          }
          action={
            total > 0 && (
              <Link to={pageLink(1)} className="text-sound-300 underline">
                Go to the newest Matches
              </Link>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {sessions.map((session) => (
            <SessionMatches
              key={session.id}
              clubName={clubName}
              session={session}
            />
          ))}
        </div>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} />}
    </>
  );
}

function SessionMatches({
  clubName,
  session,
}: {
  clubName: string;
  session: SessionSummary;
}) {
  const { matches } = session;
  return (
    <section
      aria-label={`Session, ${formatLondonDate(session.start)}, ${formatLondonTimeSpan(session.start, session.end)}`}
    >
      <SessionHeader
        to={sessionPath(session.id)}
        start={session.start}
        end={session.end}
        matchCount={session.matchCount}
        shownCount={matches.length}
        record={session.record}
        // The Session's results, oldest first like every form strip.
        form={matches.map((m) => m.outcome).reverse()}
        topPerformer={session.topPerformer}
      />
      <ul className="mt-4 grid gap-x-6 gap-y-4 lg:grid-cols-2">
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
      </ul>
    </section>
  );
}

/** Links to another page of the list, keeping the filter. */
function usePageLink() {
  const [params] = useSearchParams();
  return (page: number) => ({ search: withPage(params, page).toString() });
}

function Pagination({ page, pages }: { page: number; pages: number }) {
  const link = usePageLink();
  const step =
    "clip-slant bg-shale-800 px-5 py-2 font-display font-bold text-lg text-ink uppercase tracking-wide [--slant:0.5rem] hover:bg-shale-700";
  return (
    <nav
      aria-label="Pages"
      className="mt-8 flex items-center justify-between gap-4 border-shale-700 border-t-2 pt-4"
    >
      {page > 1 ? (
        <Link to={link(page - 1)} className={step} rel="prev">
          Newer
        </Link>
      ) : (
        <span />
      )}
      <p className="text-ink-soft text-sm tabular">
        Page {page} of {pages}
      </p>
      {page < pages ? (
        <Link to={link(page + 1)} className={step} rel="next">
          Older
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
