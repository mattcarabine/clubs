/**
 * Milestones (`/milestones`, CLUBS-36): the latest landmarks, feats and club
 * records, newest first and grouped by Session, each with its comment and
 * the Match it came in. Filter to Our Club or one Squad Member with `?who=`.
 * Milestones ignore the stats filter, like EA's totals, so there is no
 * FilterBar.
 */
import { env } from "cloudflare:workers";
import { Link } from "react-router";

import {
  chipClassName,
  EmptyState,
  LondonTime,
  MilestoneList,
  PageHeader,
  ScrollRail,
} from "~/components";
import { getDb } from "~/db/client";
import { pageMeta } from "~/lib/page-meta";
import { sessionPath } from "~/lib/paths";
import {
  listMilestonePlayers,
  listMilestones,
  MILESTONE_PAGE_SIZE,
  type MilestoneEntry,
  type MilestoneQuery,
} from "~/stats";

import type { Route } from "./+types/milestones";

/** The `who` value for Our Club's Milestones. */
const CLUB = "club";

export function meta({ location }: Route.MetaArgs) {
  return pageMeta({
    title: "A Bloo Bloo — Milestones",
    description:
      "Landmarks, standout performances and club records, Match by Match.",
    path: location.pathname,
  });
}

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const who = new URL(request.url).searchParams.get("who");
  const players = await listMilestonePlayers(db);
  let query: MilestoneQuery["who"];
  if (who === CLUB) query = CLUB;
  else if (players.some((p) => p.playerId === who)) {
    query = { playerId: who as string };
  }
  const milestones = await listMilestones(db, env.EA_CLUB_NAME, {
    who: query,
  });
  return {
    clubName: env.EA_CLUB_NAME,
    players,
    selected: query === undefined ? null : who,
    milestones,
  };
}

export default function Milestones({ loaderData }: Route.ComponentProps) {
  const { clubName, players, selected, milestones } = loaderData;
  const options = [
    { who: null, label: "All" },
    { who: CLUB, label: "Club" },
    ...players.map((p) => ({ who: p.playerId, label: p.name })),
  ];
  return (
    <>
      <PageHeader
        title="Milestones"
        subtitle={`Landmarks, standout performances and club records, newest first: the latest ${MILESTONE_PAGE_SIZE} at most`}
      />
      <nav aria-label="Whose Milestones" className="mb-6">
        <ScrollRail className="pb-1">
          <div className="flex gap-1 sm:flex-wrap">
            {options.map(({ who, label }) => (
              <Link
                key={who ?? "all"}
                to={who ? `?who=${who}` : "?"}
                aria-current={selected === who ? "page" : undefined}
                className={`${chipClassName(selected === who)} inline-flex items-center`}
              >
                {label}
              </Link>
            ))}
          </div>
        </ScrollRail>
      </nav>
      {milestones.length === 0 ? (
        <EmptyState
          title="No Milestones yet"
          description="Each Poll checks new Matches for landmarks (a 50th goal, a 100th Win), standout performances and club records, and lists them here."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {bySession(milestones).map((group) => (
            <section
              key={group.sessionId}
              aria-labelledby={`session-${group.sessionId}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="clip-slant-r bg-rave py-1 pr-4 pl-2 font-display font-extrabold text-base text-shale-950 uppercase leading-none tracking-wide [--slant:0.5rem]">
                  Session
                </span>
                <h2
                  id={`session-${group.sessionId}`}
                  className="font-display font-extrabold text-2xl text-ink uppercase leading-none tracking-wide"
                >
                  <LondonTime date={group.day} format="day" />
                </h2>
                <Link
                  to={sessionPath(group.sessionId)}
                  className="font-display font-bold text-lg text-sound-300 uppercase tracking-wide hover:text-ink"
                >
                  Session details <span aria-hidden>›</span>
                </Link>
              </div>
              <MilestoneList
                clubName={clubName}
                milestones={group.milestones}
                className="grid gap-3 lg:grid-cols-2"
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** Milestones grouped by Session, keeping their newest-first order. */
function bySession(milestones: readonly MilestoneEntry[]) {
  const groups = new Map<
    string,
    { sessionId: string; day: Date; milestones: MilestoneEntry[] }
  >();
  for (const m of milestones) {
    const group = groups.get(m.sessionId) ?? {
      sessionId: m.sessionId,
      day: m.achievedAt,
      milestones: [],
    };
    group.milestones.push(m);
    groups.set(m.sessionId, group);
  }
  return [...groups.values()];
}
