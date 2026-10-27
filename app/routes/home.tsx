/**
 * Matchday (`/`): the latest Competitive Match as the lead score strip, its
 * top performers on a ticker, the latest Milestone, Our Club's form and
 * EA's club totals. While it is open the page checks for a new Poll every
 * minute (CLUBS-7), and reloads its data only when one changed something
 * (CLUBS-46).
 */
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import { latestWriteup } from "~/ai/writeups";
import {
  EmptyState,
  FormBadge,
  FormGuide,
  HERO_WIDTH,
  LastUpdatedBadge,
  LondonTime,
  MatchHeadline,
  MatchScoreBar,
  MilestoneCard,
  PageHeader,
  SectionHeading,
  type StatDelta,
  StatGrid,
  StatTile,
  TopPerformersStrip,
} from "~/components";
import { getDb } from "~/db/client";
import type { FormStatus } from "~/lib/domain";
import { formatCount, formatOptional } from "~/lib/number-format";
import { pageMeta } from "~/lib/page-meta";
import { playerPath, sessionPath } from "~/lib/paths";
import { useLivePoll } from "~/lib/use-live-poll";
import {
  type ClubSnapshotSummary,
  clubSnapshots,
  DEFAULT_STATS_FILTER,
  getMatch,
  isTonight,
  latestSession,
  listMatches,
  listMilestones,
  type MatchSides,
  type MatchSkillRatings,
  type MatchSummary,
  type MilestoneEntry,
  pollState,
  type SquadFormRow,
  squadForm,
  summariseClubSnapshots,
  summariseMatchSides,
  summariseRecord,
  type TopPerformer,
  topPerformers,
} from "~/stats";

import type { Route } from "./+types/home";

/** How many Matches the form guide covers. */
const FORM_LENGTH = 10;
/** How many Matches after the lead one the "Recent results" list shows. */
const RECENT_RESULTS = 4;
/** How often an open Matchday checks for a new Poll. */
const REFRESH_CHECK_MS = 60_000;

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Matchday",
    description:
      "The latest Match and Session, the Squad's form and how the club stands this season.",
    path: location.pathname,
  });
}

export async function loader() {
  const db = getDb(env.DB);
  // First, so the version it carries is never newer than the data below.
  const poll = await pollState(db);
  const [recent, snapshots, squadFormRows, session, [milestone]] =
    await Promise.all([
      listMatches(db, DEFAULT_STATS_FILTER, { limit: FORM_LENGTH }),
      clubSnapshots(db),
      squadForm(db, DEFAULT_STATS_FILTER),
      latestSession(db),
      listMilestones(db, env.EA_CLUB_NAME, { limit: 1 }),
    ]);
  const latest = recent[0];
  const [detail, headline] = latest
    ? await Promise.all([
        getMatch(db, latest.matchId),
        latestWriteup(db, "headline", latest.matchId),
      ])
    : [null, null];
  return {
    clubName: env.EA_CLUB_NAME,
    recent,
    headline: headline?.text ?? null,
    skillRatings: detail?.skillRatings,
    sides: detail ? summariseMatchSides(detail.appearances) : undefined,
    performers: topPerformers(
      detail?.appearances.filter((a) => a.isOurClub) ?? [],
    ),
    club: summariseClubSnapshots(snapshots),
    poll,
    session: session && {
      path: sessionPath(session.id),
      label: isTonight(session) ? "Tonight's Session" : "Last Session",
    },
    squadForm: squadFormRows,
    milestone: milestone ?? null,
  };
}

export default function Matchday({ loaderData }: Route.ComponentProps) {
  const {
    clubName,
    recent,
    headline,
    skillRatings,
    sides,
    performers,
    club,
    poll,
    session,
    squadForm,
    milestone,
  } = loaderData;
  const { lastPoll } = useLivePoll(poll, REFRESH_CHECK_MS);
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
            headline={headline}
            skillRatings={skillRatings}
            sides={sides}
            performers={performers}
            session={session}
          />
          {milestone && (
            <LatestMilestone clubName={clubName} milestone={milestone} />
          )}
          {squadForm.length > 0 && <FormWatch rows={squadForm} />}
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
  sides?: MatchSides;
  performers: TopPerformer[];
  /** The latest Session's page, which holds this Match. */
  session: { path: string; label: string } | null;
}) {
  return (
    <section aria-labelledby="latest-match" className={HERO_WIDTH}>
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
      {session && (
        <Link
          to={session.path}
          className="mt-3 inline-block font-display font-bold text-lg text-sound-300 uppercase tracking-wide hover:text-ink"
        >
          {session.label} <span aria-hidden>›</span>
        </Link>
      )}
    </section>
  );
}

/** The newest Milestone (CLUBS-36), with a way into the rest. */
function LatestMilestone({
  clubName,
  milestone,
}: {
  clubName: string;
  milestone: MilestoneEntry;
}) {
  return (
    <section aria-label="Latest Milestone" className={HERO_WIDTH}>
      <SectionHeading
        title="Latest Milestone"
        aside={
          <Link
            to="/milestones"
            className="text-sm text-sound-300 underline-offset-4 hover:underline"
          >
            All Milestones
          </Link>
        }
      />
      <MilestoneCard clubName={clubName} milestone={milestone} />
    </section>
  );
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

const FORM_WATCH: readonly { status: FormStatus; label: string }[] = [
  { status: "hot", label: "In form" },
  { status: "cold", label: "Out of form" },
];

/**
 * Hot and Cold form (CLUBS-40): a compact strip naming who is "In form" and
 * "Out of form" over Competitive Matches, shown only when someone qualifies.
 */
function FormWatch({ rows }: { rows: readonly SquadFormRow[] }) {
  return (
    <section
      aria-label="Form watch"
      className="flex flex-col divide-y divide-shale-700 border-shale-700 border-t-2 bg-shale-900"
    >
      {FORM_WATCH.map(({ status, label }) => {
        const players = rows.filter((r) => r.formIndicator.status === status);
        if (players.length === 0) return null;
        return (
          <div
            key={status}
            className="flex min-w-0 flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <h2 className="shrink-0 font-display font-extrabold text-ink text-lg uppercase tracking-wide sm:w-32">
              {label}
            </h2>
            <ul
              aria-label={label}
              className="flex min-w-0 flex-wrap gap-x-5 gap-y-2"
            >
              {players.map(({ playerId, name, formIndicator }) => (
                <li key={playerId} className="flex min-w-0 items-center gap-2">
                  <FormBadge
                    status={formIndicator.status}
                    detail={formIndicator.text}
                  />
                  <Link
                    to={playerPath(playerId)}
                    className="truncate font-semibold text-sound-300 hover:text-ink"
                  >
                    {name}
                  </Link>
                  {/* The badge already reads this out. */}
                  <span aria-hidden className="text-ink-muted text-sm tabular">
                    {formIndicator.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
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
          {record.dnf > 0 &&
            `, ${formatCount(record.dnf, "rage quit", "rage quits")}`}
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

/** A Match's compact score strip, linking to its page. */
function MatchLink({
  clubName,
  match,
}: {
  clubName: string;
  match: MatchSummary;
}) {
  return (
    <Link to={`/matches/${match.matchId}`} className="block hover:opacity-90">
      <MatchScoreBar
        clubName={clubName}
        match={match}
        when={<LondonTime date={match.playedAt} format="moment" />}
      />
    </Link>
  );
}
