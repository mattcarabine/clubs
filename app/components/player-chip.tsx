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
  /**
   * On phones, shows just the name, without the box or Position Group, so a pinned table column stays narrow and its stats stay in view.
   */
  dense?: boolean;
};

/** Compact Squad Member identity: name, position group and an optional stat. EA has no player images, so there is no avatar. */
export function PlayerChip({
  name,
  positionGroup,
  stat,
  former = false,
  to,
  dense = false,
}: PlayerChipProps) {
  const onlyWide = dense ? "hidden sm:flex" : "flex";
  const body = (
    <>
      <span className="min-w-0 truncate font-semibold">{name}</span>
      {positionGroup && (
        <abbr
          title={positionGroup}
          className={`${onlyWide} font-display font-bold text-ink-muted text-sm no-underline`}
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

  // Dense on phones: just the name, no box or padding.
  const boxBackground = dense ? "sm:bg-shale-800" : "bg-shale-800";
  const boxStartPadding = dense ? "sm:pl-3" : "pl-3";
  const boxEndPadding = dense ? "sm:pr-3" : "pr-3";
  const className = [
    "inline-flex h-9 max-w-full min-w-0 items-center gap-2 text-sm",
    boxBackground,
    boxStartPadding,
    former ? "text-ink-soft" : "text-ink",
    // A stat pads the end itself.
    stat != null ? "" : boxEndPadding,
  ].join(" ");

  return to ? (
    <Link to={to} className={`${className} hover:bg-shale-700`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}
