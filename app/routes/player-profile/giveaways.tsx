import { MixBar, YardstickList } from "~/components";
import { formatCount, formatPercentage } from "~/lib/number-format";
import type { PlayerEventProfile } from "~/stats/event-stats";

type GiveawaysProps = {
  events: PlayerEventProfile;
  /** Who the yardstick is: "typical opposing midfielder". */
  against: string;
};

const CARD = "min-w-0 border-loss border-t-2 bg-shale-900 p-4";
const CARD_TITLE =
  "mb-4 font-display font-bold text-ink text-xl uppercase tracking-wide";

/**
 * "How they give the ball away" (CLUBS-99): a Squad Member's failed passes
 * by kind and direction and where on the pitch they lose the ball, beside
 * how often each kind of pass comes off against a typical opponent in their
 * position. EA has no count for a failed through ball or for being tackled,
 * and the section says so.
 */
const ballLostMix = (events: PlayerEventProfile) =>
  events.mixes.find((mix) => mix.id === "ballLost");

/** Whether there is anything to show, so the page can leave the heading out too. */
export function hasGiveaways(events: PlayerEventProfile): boolean {
  return events.giveaways !== null || ballLostMix(events) !== undefined;
}

export function Giveaways({ events, against }: GiveawaysProps) {
  const { giveaways } = events;
  const ballLost = ballLostMix(events);
  const mixes = [
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
    {
      label: "Where they lose the ball",
      mix: ballLost,
      unit: ["time", "times"],
    },
  ].filter(({ mix }) => mix);
  const passTypes = giveaways?.passTypes ?? [];
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {mixes.length > 0 && (
          <section aria-label="What goes astray" className={CARD}>
            <h3 className={CARD_TITLE}>What goes astray</h3>
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
            </div>
          </section>
        )}
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
        EA counts passes that went astray and where the ball was lost. It
        doesn't say when a through ball failed or when they were tackled.
      </p>
    </div>
  );
}
