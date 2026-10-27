import { useId } from "react";
import { Link } from "react-router";

import { playerPath } from "~/lib/paths";
import { fadeAttributes, useScrollFade } from "~/lib/use-scroll-fade";
import type { LeaderBoard } from "~/stats/club-leaders";

/**
 * Who leads Our Club in each career stat (CLUBS-51), as a row of broadcast
 * leader boards: a green slanted tab names the stat, the leader's figure is a
 * scoreboard numeral over their name, and the next two sit below. On phones
 * the boards are compact (leader only) in one row that scrolls sideways (its
 * clipped edge fades), three up from
 * `sm`, every board sharing one row on desktop. Hidden when there are no boards.
 */
export function ClubLeaders({
  boards,
  title = "Club leaders",
  subtitle,
}: {
  boards: readonly LeaderBoard[];
  title?: string;
  subtitle?: string;
}) {
  const [ref, edges] = useScrollFade<HTMLUListElement>();
  const headingId = useId();
  if (boards.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mb-6 sm:mb-8">
      <div className="mb-3">
        <h2
          id={headingId}
          className="font-display font-extrabold text-3xl text-ink uppercase leading-none tracking-wide"
        >
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-ink-muted text-sm">{subtitle}</p>}
      </div>
      <ul
        ref={ref}
        {...fadeAttributes(edges)}
        className="scroll-fade flex snap-x gap-2 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none"
      >
        {boards.map((board) => (
          <LeaderTile key={board.stat} board={board} />
        ))}
      </ul>
    </section>
  );
}

function LeaderTile({ board }: { board: LeaderBoard }) {
  const [leader, ...rest] = board.leaders;
  return (
    <li className="flex w-36 shrink-0 snap-start flex-col border-rave border-t-2 bg-shale-900 pb-3 sm:w-auto">
      <h3 className="clip-slant-r self-start bg-rave py-1 pr-4 pl-3 font-display font-extrabold text-shale-950 text-sm uppercase leading-none tracking-wide [--slant:0.4rem]">
        {board.label}
      </h3>
      <Link to={playerPath(leader.playerId)} className="group mt-2 block px-3">
        <span className="block font-display font-extrabold text-5xl text-ink italic tabular leading-none sm:text-score">
          {leader.figure}
        </span>
        <span className="mt-1 block truncate font-display font-extrabold text-ink text-xl uppercase tracking-wide group-hover:text-rave">
          {leader.name}
        </span>
      </Link>
      {rest.length > 0 && (
        <ol
          start={2}
          aria-label={`Next in ${board.label}`}
          className="mt-2 hidden flex-col gap-1 border-shale-700 border-t px-3 pt-2 text-sm sm:flex"
        >
          {rest.map((entry, i) => (
            <li key={entry.playerId} className="flex items-baseline gap-2">
              <span aria-hidden className="text-ink-muted tabular">
                {i + 2}
              </span>
              <Link
                to={playerPath(entry.playerId)}
                className="min-w-0 flex-1 truncate text-ink-soft hover:text-ink"
              >
                {entry.name}
              </Link>
              <span className="text-ink-soft tabular">{entry.figure}</span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
