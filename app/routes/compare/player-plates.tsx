/**
 * The two Squad Member plates at the top of a Comparison: A on deep blue to
 * the left, B on green to the right. Each plate is a switcher over the whole
 * Squad (Former Squad Members marked), with that side's Position Group
 * picker beneath it.
 */
import { useSearchParams } from "react-router";

import {
  EA_POSITIONS_DISABLED,
  FormBadge,
  PositionGroupPicker,
  ScrollRail,
} from "~/components";
import {
  COMPARISON_SIDES,
  type ComparisonSide,
  type FormIndicator,
  type PositionGroupSelection,
  type SquadMemberOption,
  type StatsSource,
  writeComparisonPlayers,
  writeComparisonPositionGroups,
} from "~/stats";

/** The switchers' names: each one's accessible label. */
export const SWITCHER_LABEL: Record<ComparisonSide, string> = {
  A: "First Squad Member",
  B: "Second Squad Member",
};

type PlayerPlatesProps = {
  members: readonly SquadMemberOption[];
  /** The zero to two compared, A first. */
  players: readonly SquadMemberOption[];
  positionGroups: Record<ComparisonSide, PositionGroupSelection>;
  source: StatsSource;
  /** Each side's Hot or Cold form (CLUBS-40), A first; none for EA totals. */
  formIndicators?: readonly (FormIndicator | null)[];
};

export function PlayerPlates({
  members,
  players,
  positionGroups,
  source,
  formIndicators = [],
}: PlayerPlatesProps) {
  const [, setSearchParams] = useSearchParams();
  const update = (write: (params: URLSearchParams) => URLSearchParams) =>
    setSearchParams(write, { preventScrollReset: true });
  const ids = players.map((p) => p.playerId);
  const choose = (index: number, playerId: string) => {
    const next = [...ids];
    next[index] = playerId;
    update((params) => writeComparisonPlayers(params, next));
  };

  return (
    <section
      aria-label="Squad Members compared"
      className="mb-6 grid grid-cols-2 gap-x-2 gap-y-3 sm:gap-x-4"
    >
      {COMPARISON_SIDES.map((side, i) => (
        <Switcher
          key={side}
          side={side}
          members={members}
          value={players[i]?.playerId}
          // B is picked after A, so it waits for one.
          disabled={i > ids.length}
          other={ids[1 - i]}
          onChange={(playerId) => choose(i, playerId)}
        />
      ))}
      {formIndicators.some(Boolean) &&
        COMPARISON_SIDES.map((side, i) => {
          const indicator = formIndicators[i];
          return (
            <div
              key={side}
              className={`flex min-w-0 ${side === "B" ? "justify-end" : ""}`}
            >
              {indicator && players[i] && (
                <FormBadge status={indicator.status} detail={indicator.text} />
              )}
            </div>
          );
        })}
      {COMPARISON_SIDES.map((side, i) => {
        const player = players[i];
        return player ? (
          <ScrollRail key={side} className="col-span-2 sm:col-span-1">
            <PositionGroupPicker
              label={`${player.name}: Position Group`}
              value={positionGroups[side]}
              onChange={(groups) =>
                update((params) =>
                  writeComparisonPositionGroups(params, side, groups),
                )
              }
              disabledReason={
                source === "ea" ? EA_POSITIONS_DISABLED : undefined
              }
            />
          </ScrollRail>
        ) : null;
      })}
    </section>
  );
}

const PLATE: Record<ComparisonSide, string> = {
  A: "clip-slant-r bg-sound-900 pr-7 pl-3 text-ink",
  B: "clip-slant-l bg-rave pr-3 pl-7 text-right text-shale-950",
};

type SwitcherProps = {
  side: ComparisonSide;
  members: readonly SquadMemberOption[];
  /** Undefined while this side waits for a pick. */
  value: string | undefined;
  disabled: boolean;
  /** The other side's Squad Member, who cannot be picked here too. */
  other: string | undefined;
  onChange: (playerId: string) => void;
};

/** A side's plate: the Squad Member's name as a dropdown of the Squad. */
function Switcher({
  side,
  members,
  value,
  disabled,
  other,
  onChange,
}: SwitcherProps) {
  return (
    <label
      className={`relative flex min-w-0 flex-col justify-center py-2 [--slant:0.9rem] ${PLATE[side]}`}
    >
      <span className="text-xs opacity-80">
        {side === "A" ? "Squad Member" : "Compare to"}
      </span>
      <select
        aria-label={SWITCHER_LABEL[side]}
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full min-w-0 cursor-pointer truncate bg-transparent font-display font-extrabold text-2xl uppercase italic leading-tight tracking-wide focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed sm:text-4xl ${side === "B" ? "text-right [text-align-last:right]" : ""}`}
      >
        {value === undefined && (
          <option value="" disabled>
            {side === "A" ? "Pick a Squad Member" : "Compare to…"}
          </option>
        )}
        {members.map((m) => (
          <option
            key={m.playerId}
            value={m.playerId}
            disabled={m.playerId === other}
            className="bg-shale-800 text-ink not-italic"
          >
            {m.former ? `${m.name} (former)` : m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
