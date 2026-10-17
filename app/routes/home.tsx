/**
 * Matchday (`/`): the latest Competitive Match as the lead score strip, its
 * top performers on a ticker, Our Club's form and EA's club totals. The page
 * refreshes itself every minute while it is open (CLUBS-7).
 */
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  EmptyState,
  FormGuide,
  LastUpdatedBadge,
  MatchScoreBar,
  PageHeader,
  SectionHeading,
  type StatDelta,
  StatGrid,
  StatTile,
  Ticker,
  type TickerItem,
} from "~/components";
import { getDb } from "~/db/client";
import {
  formatLondonDateTime,
  formatLondonShortDate,
  formatLondonTime,
} from "~/lib/london-time";
import { formatDecimal, formatOptional } from "~/lib/number-format";
import { formatRelativeTime } from "~/lib/relative-time";
import { useRevalidateWhileVisible } from "~/lib/use-revalidate-while-visible";
import {
  type ClubSnapshotSummary,
  clubSnapshots,
  DEFAULT_STATS_FILTER,
  getMatch,
  lastSuccessfulPoll,
  listMatches,
  type MatchSummary,
  summariseClubSnapshots,
  summariseRecord,
  type TopPerformer,
  topPerformers,
} from "~/stats";

import type { Route } from "./+types/home";

/** How many Matches the form guide covers. */
const FORM_LENGTH = 10;
/** How many Matches after the lead one the "Recent results" list shows. */
const RECENT_RESULTS = 4;
const REVALIDATE_MS = 60_000;

export function meta(_: Route.MetaArgs) {
  return [{ title: "A Bloo Bloo — Matchday" }];
}

export async function loader() {
  const db = getDb(env.DB);
  const [recent, snapshots, lastPoll] = await Promise.all([
    listMatches(db, DEFAULT_STATS_FILTER, { limit: FORM_LENGTH }),
    clubSnapshots(db),
    lastSuccessfulPoll(db),
  ]);
  const latest = recent[0];
  const detail = latest ? await getMatch(db, latest.matchId) : null;
  return {
    clubName: env.EA_CLUB_NAME,
    recent,
    performers: topPerformers(
      detail?.appearances.filter((a) => a.isOurClub) ?? [],
    ),
    club: summariseClubSnapshots(snapshots),
    lastPoll,
  };
}

export default function Matchday({ loaderData }: Route.ComponentProps) {
  const { clubName, recent, performers, club, lastPoll } = loaderData;
  useRevalidateWhileVisible(REVALIDATE_MS);
  const [latest, ...earlier] = recent;

  return (
    <>
      <PageHeader
        title="Matchday"
        aside={lastPoll && <LastUpdatedBadge updatedAt={lastPoll} />}
      />
      {latest ? (
        <div className="flex flex-col gap-10">
          <LatestMatch
            clubName={clubName}
            match={latest}
            performers={performers}
          />
          {club && <ClubSnapshot club={club} />}
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
            <Form matches={recent} />
            {earlier.length > 0 && (
              <RecentResults
                clubName={clubName}
                matches={earlier.slice(0, RECENT_RESULTS)}
              />
            )}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Competitive Matches yet"
          description="Matchday fills in once a Poll records a League or Playoff Match. Polls check EA every 5 minutes, and this page refreshes itself."
        />
      )}
    </>
  );
}

function LatestMatch({
  clubName,
  match,
  performers,
}: {
  clubName: string;
  match: MatchSummary;
  performers: TopPerformer[];
}) {
  return (
    <section aria-labelledby="latest-match">
      <h2 id="latest-match" className="sr-only">
        Latest Match
      </h2>
      <MatchLink clubName={clubName} match={match} hero />
      <Ticker
        label="Top performers"
        items={performers.map(toTickerItem)}
        durationSeconds={Math.max(20, performers.length * 8)}
      />
      <p className="mt-2 text-ink-muted text-sm">
        Played {formatLondonDateTime(match.playedAt)}
      </p>
    </section>
  );
}

/**
 * When the Match was played: the lead Match says how long ago, older ones give
 * the London date and time.
 */
function PlayedAt({
  playedAt,
  relative = false,
}: {
  playedAt: Date;
  relative?: boolean;
}) {
  return (
    <time dateTime={playedAt.toISOString()} suppressHydrationWarning>
      {relative
        ? formatRelativeTime(playedAt, new Date())
        : `${formatLondonShortDate(playedAt)}, ${formatLondonTime(playedAt)}`}
    </time>
  );
}

function toTickerItem(performer: TopPerformer): TickerItem {
  const parts = [
    performer.manOfTheMatch && "Man of the Match",
    performer.goals > 0 && plural(performer.goals, "goal"),
    performer.assists > 0 && plural(performer.assists, "assist"),
    performer.rating !== null && `rated ${formatDecimal(performer.rating)}`,
  ].filter(Boolean);
  return {
    id: performer.playerId,
    headline: performer.name,
    detail: parts.join(", "),
  };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The skill rating's last move, or nothing when it has not moved. */
function skillRatingDelta(change: number | null): StatDelta | undefined {
  if (change === null || change === 0) return undefined;
  const sign = change > 0 ? "+" : "";
  return {
    text: `${sign}${change} since last change`,
    tone: change > 0 ? "positive" : "negative",
  };
}

function ClubSnapshot({ club }: { club: ClubSnapshotSummary }) {
  return (
    <section aria-label="Season snapshot">
      <SectionHeading
        title="Season snapshot"
        subtitle="EA's club totals, as of the latest Poll"
      />
      <StatGrid>
        <StatTile
          label="Skill rating"
          value={formatOptional(club.skillRating)}
          featured
          trend={club.skillRatingTrend}
          delta={skillRatingDelta(club.skillRatingChange)}
        />
        <StatTile
          label="Won, drawn, lost"
          value={
            <span className="text-4xl sm:text-5xl">
              {[club.wins, club.draws, club.losses]
                .map(formatOptional)
                .join("-")}
            </span>
          }
        />
        <StatTile label="Win streak" value={formatOptional(club.winStreak)} />
        <StatTile
          label="Unbeaten run"
          value={formatOptional(club.unbeatenStreak)}
        />
      </StatGrid>
    </section>
  );
}

function Form({ matches }: { matches: MatchSummary[] }) {
  const record = summariseRecord(matches);
  const results = matches.map((m) => m.outcome).reverse();
  return (
    <section aria-label="Form">
      <SectionHeading
        title="Form"
        subtitle={`Last ${matches.length} Competitive ${matches.length === 1 ? "Match" : "Matches"}, newest on the right`}
      />
      <div className="flex flex-col gap-4 border-shale-700 border-t-2 bg-shale-900 p-4">
        {/* Ten md blocks are too wide for a phone, so phones get the sm run. */}
        <div className="sm:hidden">
          <FormGuide results={results} />
        </div>
        <div className="hidden sm:block">
          <FormGuide results={results} size="md" />
        </div>
        <dl className="grid grid-cols-3 gap-2 font-display font-extrabold uppercase">
          <FormCount label="Won" value={record.wins} />
          <FormCount label="Drawn" value={record.draws} />
          <FormCount label="Lost" value={record.losses} />
        </dl>
        <p className="text-ink-soft text-sm">
          {record.goalsFor} scored, {record.goalsAgainst} conceded
          {record.dnf > 0 && `, ${plural(record.dnf, "DNF")}`}
        </p>
      </div>
    </section>
  );
}

function FormCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dd className="text-4xl text-ink tabular leading-none">{value}</dd>
      <dt className="text-base text-ink-muted tracking-wide">{label}</dt>
    </div>
  );
}

function RecentResults({
  clubName,
  matches,
}: {
  clubName: string;
  matches: MatchSummary[];
}) {
  return (
    <section aria-label="Before that">
      <SectionHeading
        title="Before that"
        aside={
          <Link
            to="/matches"
            className="text-sm text-sound-300 underline-offset-4 hover:underline"
          >
            All Matches
          </Link>
        }
      />
      <ul className="flex flex-col gap-3">
        {matches.map((match) => (
          <li key={match.matchId}>
            <MatchLink clubName={clubName} match={match} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A Match's score strip, linking to its page. The `hero` strip leads the page
 * and says how long ago the Match was played.
 */
function MatchLink({
  clubName,
  match,
  hero = false,
}: {
  clubName: string;
  match: MatchSummary;
  hero?: boolean;
}) {
  return (
    <Link to={`/matches/${match.matchId}`} className="block hover:opacity-90">
      <MatchScoreBar
        clubName={clubName}
        match={match}
        size={hero ? "hero" : "compact"}
        status={<PlayedAt playedAt={match.playedAt} relative={hero} />}
      />
    </Link>
  );
}
