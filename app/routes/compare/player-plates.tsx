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
  PlayerChip,
  Popover,
  PopoverCaret,
  PopoverTab,
  PositionGroupPicker,
  popoverTriggerProps,
  ScrollRail,
  usePopover,
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
  A: "clip-slant-r bg-sound-900 pr-7 pl-3 text-left text-ink",
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

/**
 * A side's plate: the Squad Member's name, which opens a list of the Squad
 * (a popover under it, or a bottom sheet on phones). A pick applies at once.
 */
function Switcher({
  side,
  members,
  value,
  disabled,
  other,
  onChange,
}: SwitcherProps) {
  const popover = usePopover("[data-autofocus]");
  const current = members.find((m) => m.playerId === value);
  // Focus lands on the current pick, or else the first that can be picked.
  const autofocus =
    value ?? members.find((m) => m.playerId !== other)?.playerId;

  return (
    <>
      <button
        {...popoverTriggerProps(popover)}
        disabled={disabled}
        aria-label={`${SWITCHER_LABEL[side]}: ${current?.name ?? "none picked"}`}
        className={`relative flex min-w-0 cursor-pointer flex-col justify-center py-2 [--slant:0.9rem] focus-visible:-outline-offset-4 focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-60 ${PLATE[side]}`}
      >
        <span className="text-xs opacity-80">
          {side === "A" ? "Squad Member" : "Compare to"}
        </span>
        <span
          className={`flex min-w-0 items-center gap-2 ${side === "B" ? "justify-end" : ""}`}
        >
          <span className="min-w-0 truncate font-display font-extrabold text-2xl uppercase italic leading-tight tracking-wide sm:text-4xl">
            {current?.name ??
              (side === "A" ? "Pick a Squad Member" : "Compare to…")}
          </span>
          <PopoverCaret className="h-1.5 w-2.5 shrink-0 sm:h-2 sm:w-3" />
        </span>
      </button>
      <Popover
        popover={popover}
        label={`Choose the ${side === "A" ? "first" : "second"} Squad Member`}
      >
        <div className="pb-3 sm:w-80">
          <PopoverTab>Squad</PopoverTab>
          <ul className="flex flex-col gap-1 px-3 sm:px-4">
            {members.map((m) => {
              const picked = m.playerId === value;
              const taken = m.playerId === other;
              return (
                <li key={m.playerId}>
                  <button
                    type="button"
                    disabled={taken}
                    aria-current={picked || undefined}
                    data-autofocus={m.playerId === autofocus || undefined}
                    onClick={() => {
                      popover.close();
                      if (!picked) onChange(m.playerId);
                    }}
                    className={`flex w-full min-w-0 items-center border-l-4 bg-shale-800 text-left focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60 ${picked ? "border-rave" : "border-transparent enabled:hover:border-rave"}`}
                  >
                    <PlayerChip name={m.name} former={m.former} />
                    {(picked || taken) && (
                      <span className="ml-auto shrink-0 pr-3 pl-2 text-ink-muted text-xs">
                        {picked ? "Showing" : "Already picked"}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Popover>
    </>
  );
}
