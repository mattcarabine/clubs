/**
 * Milestones (`/milestones`, CLUBS-36, redesigned in CLUBS-51): the club
 * leaders up top, then the latest landmarks, feats and club records, newest
 * first, grouped by Session and then by Match, so each Match's score strip
 * shows once with its Milestones under it. Filter by kind with `?type=` and
 * to Our Club or one Squad Member with `?who=`; the two combine. Milestones
 * ignore the stats filter, like EA's totals, so there is no FilterBar.
 */
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  ClubLeaders,
  chipClassName,
  EmptyState,
  LondonTime,
  MatchScoreBar,
  MilestoneRow,
  PageHeader,
  ScrollRail,
} from "~/components";
import { getDb } from "~/db/client";
import { pageMeta } from "~/lib/page-meta";
import { sessionPath } from "~/lib/paths";
import {
  getClubLeaders,
  listMilestonePlayers,
  listMilestones,
  MILESTONE_PAGE_SIZE,
  type MilestoneCategory,
  type MilestoneEntry,
  type MilestoneQuery,
} from "~/stats";

import type { Route } from "./+types/milestones";

/** The `who` value for Our Club's Milestones. */
const CLUB = "club";

/** The `type` values, in chip order, with their labels. */
const TYPES: readonly { type: MilestoneCategory; label: string }[] = [
  { type: "landmark", label: "Landmarks" },
  { type: "feat", label: "Feats" },
  { type: "record", label: "Records" },
];

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Milestones",
    description:
      "The club's leaders, then landmarks, standout performances and club records, Session by Session.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const params = new URL(request.url).searchParams;
  const who = params.get("who");
  const type = TYPES.find((t) => t.type === params.get("type"))?.type;
  const [players, leaders] = await Promise.all([
    listMilestonePlayers(db),
    getClubLeaders(db),
  ]);
  let query: MilestoneQuery["who"];
  if (who === CLUB) query = CLUB;
  else if (players.some((p) => p.playerId === who)) {
    query = { playerId: who as string };
  }
  const milestones = await listMilestones(db, env.EA_CLUB_NAME, {
    who: query,
    category: type,
  });
  return {
    clubName: env.EA_CLUB_NAME,
    leaders,
    players,
    selected: { who: query === undefined ? null : who, type: type ?? null },
    milestones,
  };
}

export default function Milestones({ loaderData }: Route.ComponentProps) {
  const { clubName, leaders, players, selected, milestones } = loaderData;
  const filtered = selected.who !== null || selected.type !== null;
  const href = (change: Partial<typeof selected>) =>
    filterHref({ ...selected, ...change });
  return (
    <>
      <PageHeader
        title="Milestones"
        subtitle={`Who leads the club, then the landmarks, standout performances and club records, newest first: the latest ${MILESTONE_PAGE_SIZE} at most`}
      />
      <ClubLeaders
        boards={leaders}
        subtitle="EA's career totals; Perfect ratings since tracking began"
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:gap-8">
        <FilterLinks
          label="Milestone type"
          options={[
            {
              key: "all",
              label: "All",
              to: href({ type: null }),
              on: !selected.type,
            },
            ...TYPES.map(({ type, label }) => ({
              key: type,
              label,
              to: href({ type }),
              on: selected.type === type,
            })),
          ]}
        />
        <FilterLinks
          label="Whose Milestones"
          options={[
            {
              key: "all",
              label: "All",
              to: href({ who: null }),
              on: !selected.who,
            },
            {
              key: CLUB,
              label: "Club",
              to: href({ who: CLUB }),
              on: selected.who === CLUB,
            },
            ...players.map((p) => ({
              key: p.playerId,
              label: p.name,
              to: href({ who: p.playerId }),
              on: selected.who === p.playerId,
            })),
          ]}
        />
      </div>
      {milestones.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No Milestones match"
            description="Nothing recorded fits this type and Squad Member yet. Pick All to see every Milestone."
          />
        ) : (
          <EmptyState
            title="No Milestones yet"
            description="Each Poll checks new Matches for landmarks (a 50th goal, a 100th Win), standout performances and club records, and lists them here."
          />
        )
      ) : (
        <div className="flex flex-col gap-10">
          {groupMilestones(milestones).map((session) => (
            <SessionMilestones
              key={session.sessionId}
              clubName={clubName}
              session={session}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** `?type=&who=` for a filter choice, leaving out what is unset. */
function filterHref({
  who,
  type,
}: {
  who: string | null;
  type: MilestoneCategory | null;
}): string {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (who) params.set("who", who);
  return `?${params}`;
}

function FilterLinks({
  label,
  options,
}: {
  label: string;
  options: { key: string; label: string; to: string; on: boolean }[];
}) {
  return (
    <nav aria-label={label} className="min-w-0">
      <p className="mb-1.5 text-ink-muted text-sm">{label}</p>
      <ScrollRail className="pb-1">
        <div className="flex gap-1 sm:flex-wrap">
          {options.map((option) => (
            <Link
              key={option.key}
              to={option.to}
              aria-current={option.on ? "page" : undefined}
              className={`${chipClassName(option.on)} inline-flex items-center`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </ScrollRail>
    </nav>
  );
}

interface MatchGroup {
  match: MilestoneEntry["match"];
  milestones: MilestoneEntry[];
}

interface SessionGroup {
  sessionId: string;
  day: Date;
  count: number;
  matches: MatchGroup[];
}

/**
 * Milestones grouped by Session and then by Match, keeping their newest-first
 * order, so each Match appears once.
 */
function groupMilestones(
  milestones: readonly MilestoneEntry[],
): SessionGroup[] {
  const sessions = new Map<string, SessionGroup>();
  for (const m of milestones) {
    let session = sessions.get(m.sessionId);
    if (!session) {
      session = {
        sessionId: m.sessionId,
        day: m.achievedAt,
        count: 0,
        matches: [],
      };
      sessions.set(m.sessionId, session);
    }
    session.count++;
    let match = session.matches.find(
      (g) => g.match.matchId === m.match.matchId,
    );
    if (!match) {
      match = { match: m.match, milestones: [] };
      session.matches.push(match);
    }
    match.milestones.push(m);
  }
  return [...sessions.values()];
}

function SessionMilestones({
  clubName,
  session,
}: {
  clubName: string;
  session: SessionGroup;
}) {
  const headingId = `session-${session.sessionId}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-shale-700 border-b pb-2">
        <span className="clip-slant-r bg-rave py-1 pr-4 pl-2 font-display font-extrabold text-base text-shale-950 uppercase leading-none tracking-wide [--slant:0.5rem]">
          Session
        </span>
        <h2
          id={headingId}
          className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide"
        >
          <LondonTime date={session.day} format="day" />
        </h2>
        <span className="text-ink-muted text-sm">
          {session.count === 1 ? "1 Milestone" : `${session.count} Milestones`}
        </span>
        <Link
          to={sessionPath(session.sessionId)}
          className="font-display font-bold text-lg text-sound-300 uppercase tracking-wide hover:text-ink sm:ml-auto"
        >
          Session details <span aria-hidden>›</span>
        </Link>
      </div>
      <div className="flex flex-col gap-6">
        {session.matches.map(({ match, milestones }) => (
          <div
            key={match.matchId}
            className="grid gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-4"
          >
            <Link
              to={`/matches/${match.matchId}`}
              aria-label={`Match v ${match.opponent.name}, ${match.goalsFor}-${match.goalsAgainst}`}
              className="block self-start hover:opacity-90 lg:sticky lg:top-24"
            >
              <MatchScoreBar
                clubName={clubName}
                match={match}
                when={<LondonTime date={match.playedAt} format="moment" />}
              />
            </Link>
            <ul className="flex flex-col gap-2">
              {milestones.map((milestone) => (
                <li key={milestone.id}>
                  <MilestoneRow milestone={milestone} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
