import { MixBar, YardstickList } from "~/components";
import {
  EVENT_STAT_GROUPS,
  type EventStatGroup,
  type EventStatId,
  eventStatsIn,
  INFLUENCE,
  type PlayerEventProfile,
  type StyleMix,
} from "~/stats/event-stats";

import { yardstickItems } from "./influence";

type PlayStyleProps = {
  events: PlayerEventProfile;
  /** Who the yardstick is: "typical opposing midfielder". */
  against: string;
};

/** Each mix's heading, the card it sits in and what it shares out. */
const MIXES: Record<
  StyleMix["id"],
  { group: EventStatGroup; label: string; unit: string }
> = {
  shots: { group: "attacking", label: "Where they shoot from", unit: "shots" },
  passDirection: {
    group: "passing",
    label: "Which way they pass",
    unit: "passes",
  },
  passLength: {
    group: "passing",
    label: "How far they pass",
    unit: "passes",
  },
  ballLost: {
    group: "onTheBall",
    label: "Where they lose the ball",
    unit: "times",
  },
  ballWon: {
    group: "defending",
    label: "Where they win the ball back",
    unit: "times",
  },
};

const IN_INFLUENCE: ReadonlySet<EventStatId> = new Set([
  ...INFLUENCE.adds,
  ...INFLUENCE.costs,
]);

/**
 * "How they play" (CLUBS-85): the rest of a Squad Member's Event Stats, one
 * card per part of the game, each figure beside a typical opponent in their
 * position, with the mixes (where they shoot from, which way they pass,
 * where they win and lose the ball) as 100% bars. Influence's own figures
 * are not repeated.
 */
export function PlayStyle({ events, against }: PlayStyleProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {EVENT_STAT_GROUPS.map(({ id, label }) => {
        const stats = eventStatsIn(id).filter((s) => !IN_INFLUENCE.has(s));
        const mixes = events.mixes.filter((m) => MIXES[m.id].group === id);
        if (stats.length === 0 && mixes.length === 0) return null;
        return (
          <section
            key={id}
            aria-label={label}
            className="min-w-0 border-shale-700 border-t-2 bg-shale-900 p-4"
          >
            <h3 className="mb-4 font-display font-bold text-ink text-xl uppercase tracking-wide">
              {label}
            </h3>
            <div className="grid gap-5">
              {mixes.map((mix) => (
                <MixBar
                  key={mix.id}
                  label={MIXES[mix.id].label}
                  note={`of ${mix.total} ${MIXES[mix.id].unit}`}
                  parts={mix.parts}
                />
              ))}
              {stats.length > 0 && (
                <YardstickList
                  label={label}
                  against={against}
                  items={yardstickItems(events, stats)}
                />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
