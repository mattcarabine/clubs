import { MixBar, YardstickList } from "~/components";
import { formatCount, formatPercentage } from "~/lib/number-format";
import type { PlayerEventProfile, ShareMix } from "~/stats/event-stats";

import { yardstickItems } from "./influence";

type GiveawaysProps = {
  events: PlayerEventProfile;
  /** Who the yardstick is: "typical opposing midfielder". */
  against: string;
};

const CARD = "min-w-0 border-loss border-t-2 bg-shale-900 p-4";
const CARD_TITLE =
  "mb-4 font-display font-bold text-ink text-xl uppercase tracking-wide";

/**
 * "How they give the ball away" (CLUBS-99): passes gone astray beside the
 * ball lost while on it (tackled, or a dribble or touch gone wrong, which EA
 * counts together) and where on the pitch that happens; the failed passes by
 * kind and direction; and how often each kind of pass comes off against a
 * typical opponent in their position.
 */
const ballLostMix = (events: PlayerEventProfile) =>
  events.mixes.find((mix) => mix.id === "ballLost");

/** Whether there is anything to show, so the page can leave the heading out too. */
export function hasGiveaways(events: PlayerEventProfile): boolean {
  return events.giveaways !== null || ballLostMix(events) !== undefined;
}

export function Giveaways({ events, against }: GiveawaysProps) {
  const { giveaways } = events;
  const onTheBall = [
    {
      label: "Every time they gave it away",
      mix: giveaways?.overall,
      unit: ["time", "times"],
    },
    {
      label: "Where they lose it on the ball",
      mix: ballLostMix(events),
      unit: ["time", "times"],
    },
  ] as const;
  const passes = [
    {
      label: "Passes that went astray, by kind",
      mix: giveaways?.byLength,
      unit: ["pass", "passes"],
    },
    {
      label: "Passes that went astray, by direction",
      mix: giveaways?.byDirection,
      unit: ["pass", "passes"],
    },
  ] as const;
  const passTypes = giveaways?.passTypes ?? [];
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <MixCard title="How it goes" mixes={onTheBall}>
          <YardstickList
            label="Lost on the ball"
            against={against}
            items={yardstickItems(events, ["ballLost"]).map((item) => ({
              ...item,
              label: "Lost on the ball",
              description:
                "Times they were tackled or lost a dribble or touch, per 90 minutes",
            }))}
          />
        </MixCard>
        <MixCard title="Passes that go astray" mixes={passes} />
        {passTypes.length > 0 && (
          <section aria-label="Passes that came off" className={CARD}>
            <h3 className={CARD_TITLE}>Passes that came off</h3>
            <YardstickList
              label="Passes that came off"
              against={against}
              items={passTypes.map((type) => ({
                ...type,
                description: `${type.attempted - type.failed} of ${type.attempted} reached a teammate`,
                format: formatPercentage,
              }))}
            />
          </section>
        )}
      </div>
      <p className="-mt-3 text-ink-muted text-xs">
        Lost on the ball means tackled, or a dribble or touch gone wrong: EA
        counts those together. Lost on the ball is per 90 minutes, and less is
        better.
      </p>
    </div>
  );
}

/** A card of 100% bars, left out when none has anything to share out. */
function MixCard({
  title,
  mixes,
  children,
}: {
  title: string;
  mixes: readonly {
    label: string;
    mix: ShareMix | null | undefined;
    unit: readonly [string, string];
  }[];
  children?: React.ReactNode;
}) {
  if (mixes.every(({ mix }) => !mix)) return null;
  return (
    <section aria-label={title} className={CARD}>
      <h3 className={CARD_TITLE}>{title}</h3>
      <div className="grid gap-5">
        {mixes.map(
          ({ label, mix, unit }) =>
            mix && (
              <MixBar
                key={label}
                label={label}
                note={`of ${formatCount(mix.total, unit[0], unit[1])}`}
                parts={mix.parts}
              />
            ),
        )}
        {children}
      </div>
    </section>
  );
}
