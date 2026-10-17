import { useId } from "react";

import { POSITION_GROUPS } from "~/lib/domain";
import {
  ALL_POSITIONS,
  ALL_POSITIONS_LABEL,
  type PositionGroupSelection,
  togglePositionGroup,
} from "~/stats/positions";

import { Chip, ChipGroup } from "./chip";

/** The `disabledReason` for any Position Group picker over EA's totals. */
export const EA_POSITIONS_DISABLED =
  "EA's totals can't be split by Position Group";

type PositionGroupPickerProps = {
  /** The selected Position Groups; empty means All Positions. */
  value: PositionGroupSelection;
  onChange: (next: PositionGroupSelection) => void;
  /** The group's legend; name each one when a page has several (Compare). */
  label?: string;
  /**
   * Why the selection cannot apply, e.g. on EA's totals. The chips then
   * stay visible but disabled, with this as their tooltip and description.
   */
  disabledReason?: string;
};

/**
 * The Position Group multi-select (CLUBS-23): "All Positions" plus one chip
 * per Position Group, by EA's exact names. Presentational, so a page can show
 * one for the global `?pos=` selection (inside the FilterBar) or one per
 * player (Compare's `?posA=` / `?posB=`).
 */
export function PositionGroupPicker({
  value,
  onChange,
  label = "Position Group",
  disabledReason,
}: PositionGroupPickerProps) {
  const reasonId = useId();
  const disabled = disabledReason !== undefined;
  return (
    <ChipGroup
      label={label}
      disabled={disabled}
      title={disabledReason}
      aria-describedby={disabled ? reasonId : undefined}
    >
      <Chip
        pressed={value.length === 0}
        title={disabledReason}
        onClick={() => onChange(ALL_POSITIONS)}
      >
        {ALL_POSITIONS_LABEL}
      </Chip>
      {POSITION_GROUPS.map((group) => (
        <Chip
          key={group}
          pressed={value.includes(group)}
          title={disabledReason}
          onClick={() => onChange(togglePositionGroup(value, group))}
        >
          {group}
        </Chip>
      ))}
      {disabled && (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      )}
    </ChipGroup>
  );
}
