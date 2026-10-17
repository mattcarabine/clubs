import { Link } from "react-router";

import { EmptyState, OutcomeBadge } from "~/components";
import { formatLondonShortDate } from "~/lib/london-time";
import type { SquadAppearance } from "~/stats";

import { formatRating } from "./format";

type BestMatchesProps = {
  appearances: readonly SquadAppearance[];
};

/** The highest-rated Appearances, each linking to its Match. */
export function BestMatches({ appearances }: BestMatchesProps) {
  if (appearances.length === 0) {
    return (
      <EmptyState
        title="No rated Appearances"
        description="EA rates every completed Match; ratings appear after the next Poll."
      />
    );
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {appearances.map((a, i) => (
        <li key={a.matchId}>
          <Link
            to={`/matches/${a.matchId}`}
            className="group grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-stretch bg-shale-900 hover:bg-shale-800"
          >
            <span
              className={`clip-slant-r flex items-center justify-center pr-2 font-display font-extrabold text-3xl text-ink tabular [--slant:0.6rem] ${i === 0 ? "bg-sound-700" : "bg-sound-900"}`}
            >
              <span className="sr-only">Rating </span>
              {formatRating(a.rating)}
            </span>
            <span className="min-w-0 px-3 py-2">
              <span className="block truncate font-display font-bold text-ink text-xl uppercase leading-tight tracking-wide group-hover:text-sound-300">
                <span className="text-ink-muted">v </span>
                {a.opponentName}
              </span>
              <span className="block truncate text-ink-muted text-sm">
                {formatLondonShortDate(a.playedAt)}
                <span className="ml-3 text-ink-soft">
                  {contributions(a.goals, a.assists)}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-2 pr-3">
              <span className="font-display font-extrabold text-2xl text-ink tabular">
                {a.goalsFor}–{a.goalsAgainst}
              </span>
              <OutcomeBadge outcome={a.outcome} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function contributions(goals: number, assists: number): string {
  const parts = [
    goals > 0 && `${goals} ${goals === 1 ? "goal" : "goals"}`,
    assists > 0 && `${assists} ${assists === 1 ? "assist" : "assists"}`,
  ].filter(Boolean);
  return parts.join(", ");
}
