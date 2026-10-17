/** The Match list: every Match the filter selects, newest first, a page at a time. */
import { env } from "cloudflare:workers";
import { Link, useSearchParams } from "react-router";

import {
  EmptyState,
  FilterBar,
  FormGuide,
  LondonTime,
  MatchScoreBar,
  PageHeader,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate, londonDateKey } from "~/lib/london-time";
import { pageCount, parsePage, withPage } from "~/lib/pagination";
import {
  countMatches,
  groupBy,
  listMatches,
  type MatchSummary,
  statsFilterFromRequest,
} from "~/stats";

import type { Route } from "./+types/matches";

const PAGE_SIZE = 20;

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.clubName ?? "A Bloo Bloo"} — Matches` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = statsFilterFromRequest(request);
  const page = parsePage(new URL(request.url).searchParams);
  const [total, matches] = await Promise.all([
    countMatches(db, filter),
    listMatches(db, filter, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
  ]);
  // A night's Matches sit together under its London date.
  const days = [...groupBy(matches, (m) => londonDateKey(m.playedAt))].map(
    ([key, dayMatches]) => ({ key, matches: dayMatches }),
  );
  return {
    clubName: env.EA_CLUB_NAME,
    filter,
    days,
    page,
    pages: pageCount(total, PAGE_SIZE),
    total,
  };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const { clubName, filter, days, page, pages, total } = loaderData;
  const pageLink = usePageLink();
  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${total} ${total === 1 ? "Match" : "Matches"}, newest first`}
      />
      <FilterBar filter={filter} />

      {days.length === 0 ? (
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
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <MatchDay key={day.key} clubName={clubName} matches={day.matches} />
          ))}
        </div>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} />}
    </>
  );
}

function MatchDay({
  clubName,
  matches,
}: {
  clubName: string;
  matches: MatchSummary[];
}) {
  const date = formatLondonDate(matches[0].playedAt);
  return (
    <section aria-label={date}>
      <div className="mb-3 flex items-center justify-between gap-3 border-shale-700 border-b pb-2">
        <h2 className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide">
          {date}
        </h2>
        {/* The night's results, oldest first like every form strip. */}
        <FormGuide results={matches.map((m) => m.outcome).reverse()} />
      </div>
      <ul className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
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
