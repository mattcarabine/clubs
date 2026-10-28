import { useId } from "react";

import { Chip, ChipGroup } from "./chip";

/** The `disabledReason` for the toggle over EA's totals. */
export const EA_POSITIONS_DISABLED = "EA's totals can't be split by position";

/** The toggle's tooltip: what it does, in plain words. */
const MAIN_POSITION_HINT =
  "Counts each player's matches in the position they played most";

type MainPositionToggleProps = {
  /** Whether only each Squad Member's Main Position counts (CLUBS-82). */
  value: boolean;
  onChange: (next: boolean) => void;
  /**
   * Why the toggle cannot apply, e.g. on EA's totals. It then stays visible
   * but disabled, with this as its tooltip and description.
   */
  disabledReason?: string;
};

/**
 * "Main position only" (CLUBS-82): one chip, pressed by default, that limits
 * each Squad Member's stats to their Main Position, so a midfielder and a
 * forward are each judged where they play. Presentational: the FilterBar and
 * Analysis's Squad members section wire it to `?positions=`.
 */
export function MainPositionToggle({
  value,
  onChange,
  disabledReason,
}: MainPositionToggleProps) {
  const reasonId = useId();
  const disabled = disabledReason !== undefined;
  return (
    <ChipGroup
      label="Position"
      disabled={disabled}
      title={disabledReason}
      aria-describedby={disabled ? reasonId : undefined}
    >
      <Chip
        pressed={value}
        title={disabledReason ?? MAIN_POSITION_HINT}
        onClick={() => onChange(!value)}
      >
        Main position only
      </Chip>
      {disabled && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </ChipGroup>
  );
}
