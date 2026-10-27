/**
 * Matches, the home page (`/`, ADR 0008): every Match the filter selects,
 * newest first, under a header for its Session, a page of whole Sessions at a
 * time (CLUBS-34). Unfiltered, the first page leads with the latest Match as
 * a hero with its top performers. While it is open the page checks for a new
 * Poll every minute (CLUBS-7), and reloads its data only when one changed
 * something (CLUBS-46).
 */
import { env } from "cloudflare:workers";
import { Link, useSearchParams } from "react-router";

import { latestWriteups } from "~/ai/writeups";
import {
  EmptyState,
  FilterBar,
  HERO_WIDTH,
  LastUpdatedBadge,
  LondonTime,
  MatchHeadline,
  MatchScoreBar,
  PageHeader,
  SessionHeader,
  TopPerformersStrip,
} from "~/components";
import { getDb } from "~/db/client";
import { formatLondonDate, formatLondonTimeSpan } from "~/lib/london-time";
import { pageMeta } from "~/lib/page-meta";
import { parsePage, withPage } from "~/lib/pagination";
import { sessionPath } from "~/lib/paths";
import { firstSentence } from "~/lib/text";
import { useLivePoll } from "~/lib/use-live-poll";
import {
  getMatch,
  isDefaultStatsFilter,
  isTonight,
  listSessionPage,
  type MatchSides,
  type MatchSkillRatings,
  type MatchSummary,
  pollState,
  resolveStatsFilter,
  type SessionSummary,
  statsFilterFromRequest,
  summariseMatchSides,
  type TopPerformer,
  topPerformers,
} from "~/stats";

import type { Route } from "./+types/matches";

/** A page holds whole Sessions until it has at least this many Matches. */
const PAGE_SIZE = 20;
/** How often an open Matches page checks for a new Poll. */
const REFRESH_CHECK_MS = 60_000;

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Matches",
    description:
      "The latest Match, then every Match grouped by Session, with scores, Outcomes and top performers.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  // First, so the version it carries is never newer than the data below.
  const poll = await pollState(db);
  const filter = await resolveStatsFilter(db, statsFilterFromRequest(request));
  const page = parsePage(new URL(request.url).searchParams);
  const { sessions, pages, total } = await listSessionPage(db, filter, {
    page,
    pageSize: PAGE_SIZE,
  });
  // The hero is "what just happened", so only the unfiltered first page has one.
  const lead =
    page === 1 && isDefaultStatsFilter(filter) ? sessions[0] : undefined;
  const [recaps, headlines, latest] = await Promise.all([
    latestWriteups(
      db,
      "session",
      sessions.map((s) => s.id),
    ),
    latestWriteups(
      db,
      "headline",
      sessions.flatMap((s) => s.matches.map((m) => m.matchId)),
    ),
    lead ? getMatch(db, lead.matches[0].matchId) : null,
  ]);
  // Only each recap's first sentence leaves the server.
  const teasers = Object.fromEntries(
    [...recaps].map(([id, recap]) => [id, firstSentence(recap.text)]),
  );
  return {
    clubName: env.EA_CLUB_NAME,
    poll,
    hero:
      lead && latest
        ? {
            match: lead.matches[0],
            skillRatings: latest.skillRatings,
            sides: summariseMatchSides(latest.appearances),
            performers: topPerformers(
              latest.appearances.filter((a) => a.isOurClub),
            ),
            session: {
              path: sessionPath(lead.id),
              label: isTonight(lead) ? "Tonight's Session" : "Last Session",
            },
          }
        : null,
    filter,
    sessions,
    teasers,
    headlines: Object.fromEntries(
      [...headlines].map(([id, headline]) => [id, headline.text]),
    ),
    page,
    pages,
    total,
  };
}

export default function Matches({ loaderData }: Route.ComponentProps) {
  const {
    clubName,
    poll,
    hero,
    filter,
    sessions,
    teasers,
    headlines,
    page,
    pages,
    total,
  } = loaderData;
  const { lastPoll } = useLivePoll(poll, REFRESH_CHECK_MS);
  const pageLink = usePageLink();
  return (
    <>
      <PageHeader
        title="Matches"
        subtitle={`${total} ${total === 1 ? "Match" : "Matches"}, newest first`}
        aside={lastPoll && <LastUpdatedBadge updatedAt={lastPoll} />}
      />
      {hero && (
        <LatestMatch
          clubName={clubName}
          headline={headlines[hero.match.matchId] ?? null}
          {...hero}
        />
      )}
      <FilterBar filter={filter} />

      {sessions.length === 0 ? (
        <EmptyState
          title={total === 0 ? "No Matches" : "No Matches on this page"}
          description={
            total === 0
              ? "No Matches fit these filters. Widen the Match Types or dates, or wait for the next Poll: Polls check EA every 5 minutes, and this page refreshes itself."
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
              teaser={teasers[session.id]}
              headlines={headlines}
            />
          ))}
        </div>
      )}

      {pages > 1 && <Pagination page={page} pages={pages} />}
    </>
  );
}

/** The latest Competitive Match as the lead score strip, with its top performers. */
function LatestMatch({
  clubName,
  match,
  headline,
  skillRatings,
  sides,
  performers,
  session,
}: {
  clubName: string;
  match: MatchSummary;
  headline: string | null;
  skillRatings?: MatchSkillRatings;
  sides: MatchSides;
  performers: TopPerformer[];
  /** The Session that holds this Match. */
  session: { path: string; label: string };
}) {
  return (
    <section aria-labelledby="latest-match" className={`mb-10 ${HERO_WIDTH}`}>
      <h2 id="latest-match" className="sr-only">
        Latest Match
      </h2>
      <Link to={`/matches/${match.matchId}`} className="block hover:opacity-90">
        <MatchScoreBar
          clubName={clubName}
          match={match}
          size="hero"
          when={<LondonTime date={match.playedAt} format="moment" />}
          skillRatings={skillRatings}
          sides={sides}
        />
        {headline && <MatchHeadline text={headline} size="hero" />}
      </Link>
      {performers.length > 0 && (
        <div className="mt-1">
          <TopPerformersStrip performers={performers} />
        </div>
      )}
      <Link
        to={session.path}
        className="mt-3 inline-block font-display font-bold text-lg text-sound-300 uppercase tracking-wide hover:text-ink"
      >
        {session.label} <span aria-hidden>›</span>
      </Link>
    </section>
  );
}

function SessionMatches({
  clubName,
  session,
  teaser,
  headlines,
}: {
  clubName: string;
  session: SessionSummary;
  /** The recap's first sentence, once written. */
  teaser?: string;
  /** Each Match's headline by Match ID, once written. */
  headlines: Record<string, string>;
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
        teaser={teaser}
      />
      <ul className="mt-4 grid gap-x-6 gap-y-4 lg:grid-cols-2">
        {matches.map((match) => (
          <li key={match.matchId} className="min-w-0">
            <Link
              to={`/matches/${match.matchId}`}
              className="block transition-[filter] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-rave focus-visible:outline-offset-4"
            >
              <MatchScoreBar
                clubName={clubName}
                match={match}
                when={<LondonTime date={match.playedAt} format="time" />}
              />
              {headlines[match.matchId] && (
                <MatchHeadline text={headlines[match.matchId]} />
              )}
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
