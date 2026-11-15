import {
  EmptyState,
  SmallSampleTag,
  StatGrid,
  StatTile,
  type YardstickItem,
  YardstickList,
} from "~/components";
import { formatCount, formatPercentage } from "~/lib/number-format";
import {
  EVENT_STATS,
  type EventStatId,
  formatEventStat,
  INFLUENCE,
  type PlayerEventProfile,
  type ResultMover,
  type ResultMovers,
  type TeamShare,
  type TeamShares,
} from "~/stats/event-stats";

type InfluenceProps = {
  name: string;
  events: PlayerEventProfile;
  /** Who the yardstick is: "typical opposing midfielder". */
  against: string;
};

/** A profile's rows for some Event Stats, each beside its yardstick. */
export function yardstickItems(
  events: PlayerEventProfile,
  ids: readonly EventStatId[],
): YardstickItem[] {
  return ids.map((id) => ({
    ...events.lines[id],
    label: EVENT_STATS[id].label,
    description: EVENT_STATS[id].description,
    format: (value: number) => formatEventStat(id, value),
  }));
}

/**
 * Influence (CLUBS-85), the lead of a profile: how much of what the team
 * does comes from this Squad Member, what they add and what they give away
 * beside a typical opponent in their position, and what goes with winning.
 * Figures only: there is no score.
 */
export function Influence({ name, events, against }: InfluenceProps) {
  return (
    <div className="grid gap-6">
      <TeamShareTiles shares={events.teamShares} />
      <div className="grid gap-6 lg:grid-cols-2">
        <InfluenceCard
          title="What they add"
          note="More is better."
          rule="border-rave"
        >
          <YardstickList
            label="What they add"
            against={against}
            items={yardstickItems(events, INFLUENCE.adds)}
          />
        </InfluenceCard>
        <InfluenceCard
          title="What they give away"
          note="Less is better."
          rule="border-loss"
        >
          <YardstickList
            label="What they give away"
            against={against}
            items={yardstickItems(events, INFLUENCE.costs)}
          />
        </InfluenceCard>
      </div>
      <p className="-mt-3 text-ink-muted text-xs">
        Figures are per 90 minutes unless they are a %. The bar is {name}. The
        white marker is a {against}, from the humans we played against.
      </p>
      <ResultMoversPanel name={name} movers={events.movers} />
    </div>
  );
}

function InfluenceCard({
  title,
  note,
  rule,
  children,
}: {
  title: string;
  note: string;
  rule: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 border-t-2 bg-shale-900 p-4 ${rule}`}
    >
      <h3 className="font-display font-bold text-ink text-xl uppercase tracking-wide">
        {title}
      </h3>
      <p className="mb-4 text-ink-muted text-sm">{note}</p>
      {children}
    </section>
  );
}

const SHARE_LABEL: Record<TeamShare["id"], string> = {
  goals: "Of our goals, scored or set up",
  shotsOnTarget: "Of our shots on target",
  ballWon: "Of the ball we won back",
  ballLost: "Of the ball we lost",
};

/** Their part of what the team did, each beside an equal share of the minutes. */
function TeamShareTiles({ shares }: { shares: TeamShares }) {
  const { evenShare } = shares;
  if (shares.shares.length === 0) return null;
  return (
    <section aria-label="Share of the team">
      <p className="mb-2 text-ink-muted text-sm">
        An even share is what an equal split of our players' minutes would give
        them.
      </p>
      <StatGrid>
        {shares.shares.map((share, i) => (
          <StatTile
            key={share.id}
            label={SHARE_LABEL[share.id]}
            value={formatPercentage(share.share)}
            featured={i === 0}
            delta={{ text: shareNote(share, evenShare), tone: "neutral" }}
          />
        ))}
      </StatGrid>
    </section>
  );
}

/**
 * "3 of 4, more than an even share (50%)": the counts, and where the share
 * sits against an equal split of the minutes. Goals get the counts alone,
 * since one goal can count for its scorer and both passers.
 */
function shareNote(share: TeamShare, evenShare: number | null): string {
  const counts = `${share.own} of ${share.team}`;
  if (share.id === "goals" || evenShare === null) return counts;
  const even = `an even share (${formatPercentage(evenShare)})`;
  // Judged on the whole percentages shown.
  const gap = Math.round(share.share) - Math.round(evenShare);
  if (gap === 0) return `${counts}, ${even}`;
  return `${counts}, ${gap > 0 ? "more" : "less"} than ${even}`;
}

/** What goes with winning and with dropping points, as two short lists. */
function ResultMoversPanel({
  name,
  movers,
}: {
  name: string;
  movers: ResultMovers;
}) {
  return (
    <section aria-label="What goes with winning" className="min-w-0">
      <h3 className="font-display font-bold text-ink text-xl uppercase tracking-wide">
        What goes with winning
      </h3>
      <p className="mb-3 text-ink-muted text-sm">
        How often we won when {name} did more of something, and when they did
        less. A pattern in {formatCount(movers.matches, "match", "matches")} so
        far, not proof. Rage quits are left out.
      </p>
      {movers.up.length === 0 && movers.down.length === 0 ? (
        <EmptyState
          title="No clear pattern yet"
          description="Nothing they do more or less of goes with a clear change in how often we win. More matches may show one."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <MoverList title="We win more with" movers={movers.up} />
          <MoverList title="We win less with" movers={movers.down} />
        </div>
      )}
    </section>
  );
}

function MoverList({
  title,
  movers,
}: {
  title: string;
  movers: readonly ResultMover[];
}) {
  if (movers.length === 0) return null;
  return (
    <div className="min-w-0">
      <h4 className="mb-2 font-display font-bold text-ink-soft text-lg uppercase tracking-wide">
        {title}
      </h4>
      <ul aria-label={title} className="grid gap-3">
        {movers.map((mover) => (
          <li
            key={mover.id}
            data-mover={mover.id}
            className={`grid min-w-0 gap-1.5 border-t-2 bg-shale-900 p-4 ${mover.gap > 0 ? "border-win" : "border-loss"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{mover.label}</p>
              {mover.smallSample && <SmallSampleTag />}
            </div>
            <p className="text-ink-soft text-sm">
              Won {mover.more.wins} of {mover.more.played} (
              <strong className="text-ink">
                {formatPercentage(mover.more.winPercentage)}
              </strong>
              ). With fewer, won {mover.fewer.wins} of {mover.fewer.played} (
              <strong className="text-ink">
                {formatPercentage(mover.fewer.winPercentage)}
              </strong>
              ).
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
