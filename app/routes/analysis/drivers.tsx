/**
 * Analysis's "Why we win" and "Why we lose" (CLUBS-95): up to three stats
 * each, the ones that differ most between Wins and Dropped Points, with the
 * figures either side and the Squad Member who shows it most.
 */
import { Link } from "react-router";

import { EmptyState, SmallSampleTag, Tag } from "~/components";
import { playerPath } from "~/lib/paths";
import type { ResultDriver, ResultDrivers } from "~/stats/result-drivers";

const PANELS = {
  win: {
    title: "Why we win",
    rule: "border-win",
    empty: "Nothing we do stands out in our wins yet.",
  },
  lose: {
    title: "Why we lose",
    rule: "border-loss",
    empty: "Nothing stands out in our draws and defeats yet.",
  },
} as const;

export function DriversSection({ drivers }: { drivers: ResultDrivers }) {
  if (drivers.win.length === 0 && drivers.lose.length === 0) {
    return (
      <EmptyState
        title="No clear reasons yet"
        description="Nothing separates our wins from our draws and defeats in these matches. More matches may show something."
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-6">
      {(["win", "lose"] as const).map((side) => (
        <section
          key={side}
          aria-label={PANELS[side].title}
          className={`min-w-0 border-t-2 bg-shale-900 ${PANELS[side].rule}`}
        >
          <h3 className="px-4 pt-3 font-display font-bold text-2xl text-ink uppercase tracking-wide">
            {PANELS[side].title}
          </h3>
          {drivers[side].length > 0 ? (
            <ol>
              {drivers[side].map((driver) => (
                <DriverItem key={driver.id} driver={driver} />
              ))}
            </ol>
          ) : (
            <p className="px-4 py-3 text-ink-soft text-sm">
              {PANELS[side].empty}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function DriverItem({ driver }: { driver: ResultDriver }) {
  const { player } = driver;
  return (
    <li className="flex flex-col gap-2 border-shale-700 border-b px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <Tag>
          {driver.club === "opponent" ? "Opponents: " : ""}
          {driver.label}
        </Tag>
        {driver.smallSample && <SmallSampleTag />}
      </div>
      <p className="font-semibold text-ink">{driver.text}.</p>
      <Figures wins={driver.wins} dropped={driver.dropped} />
      {player && (
        <p className="text-ink-soft text-sm">
          <Link
            to={playerPath(player.playerId)}
            className="font-semibold text-sound-300 hover:underline"
          >
            {player.name}
          </Link>{" "}
          shows it most: {player.wins} in wins, {player.dropped} in draws and
          defeats
          {player.smallSample ? " (small sample)" : ""}.
        </p>
      )}
    </li>
  );
}

/** The figure in Wins and in Dropped Points, each named. */
function Figures({ wins, dropped }: { wins: string; dropped: string }) {
  return (
    <dl className="flex gap-6 tabular">
      {(
        [
          ["Wins", wins],
          ["Draws and defeats", dropped],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dd className="font-display font-extrabold text-3xl text-ink leading-none">
            {value}
          </dd>
          <dt className="font-display font-bold text-ink-muted text-sm uppercase tracking-wide">
            {label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
