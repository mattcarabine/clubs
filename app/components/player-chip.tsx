import type { ReactNode } from "react";
import { Link } from "react-router";
import { POSITION_GROUP_ABBR, type PositionGroup } from "~/lib/domain";

type PlayerChipProps = {
  name: string;
  positionGroup?: PositionGroup;
  /** Optional trailing stat, e.g. "7 G". */
  stat?: ReactNode;
  /** Mutes the chip and labels it, for Former Squad Members in all-time views. */
  former?: boolean;
  /** Turns the chip into a link, e.g. to the Squad Member's page. */
  to?: string;
};

/** Compact Squad Member identity: initials block, name, position group and an optional stat. */
export function PlayerChip({
  name,
  positionGroup,
  stat,
  former = false,
  to,
}: PlayerChipProps) {
  const body = (
    <>
      <span
        aria-hidden
        className={`clip-slant-r flex h-full w-9 shrink-0 items-center justify-center pr-1 font-display font-extrabold text-base [--slant:0.35rem] ${former ? "bg-shale-700 text-ink-soft" : "bg-sound-700 text-ink"}`}
      >
        {initials(name)}
      </span>
      <span className="min-w-0 truncate font-semibold">{name}</span>
      {positionGroup && (
        <abbr
          title={positionGroup}
          className="font-display font-bold text-ink-muted text-sm no-underline"
        >
          {POSITION_GROUP_ABBR[positionGroup]}
        </abbr>
      )}
      {former && <span className="text-ink-muted text-xs">Former</span>}
      {stat != null && (
        <span className="ml-auto pr-3 pl-1 font-display font-extrabold text-ink text-lg">
          {stat}
        </span>
      )}
    </>
  );

  const className = `inline-flex h-9 max-w-full min-w-0 items-center gap-2 bg-shale-800 pr-3 text-sm ${former ? "text-ink-soft" : "text-ink"} ${stat != null ? "pr-0" : ""}`;

  return to ? (
    <Link to={to} className={`${className} hover:bg-shale-700`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

/** "Kopite Kev" -> "KK", "TrentBoi_99" -> "TR": first letters of the first two wordy parts. */
function initials(name: string): string {
  const words = name.split(/[^\p{L}]+/u).filter(Boolean);
  const letters =
    words.length > 1
      ? words[0][0] + words[1][0]
      : (words[0] ?? name).slice(0, 2);
  return letters.toUpperCase();
}
