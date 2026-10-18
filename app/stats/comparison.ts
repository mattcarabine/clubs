/**
 * Comparison queries and roll-ups (CLUBS-20): two Squad Members side by side,
 * from our Recorded Appearances (which the `StatsFilter` narrows) or EA's
 * season totals (which it cannot). The URL format is in `comparison-params.ts`.
 */
import type { Db } from "~/db/client";

import {
  COMPARISON_SIDES,
  type ComparisonParams,
  type ComparisonScope,
} from "./comparison-params";
import { isCountedAppearance } from "./counted";
import { type EaSeasonTotals, eaMemberTotals } from "./ea-totals";
import type { StatsFilter } from "./filter";
import { type FormPoint, formSeries } from "./player";
import {
  filterByPositionGroups,
  type PositionGroupSelection,
} from "./positions";
import { type FormIndicator, formIndicator } from "./recent-change";
import {
  listSquadMembers,
  type SquadAppearance,
  type SquadMemberOption,
  squadAppearances,
} from "./squad";
import {
  type PlayerTotals,
  type RecordSummary,
  summariseAppearances,
  summariseRecord,
} from "./summaries";

/** Below this many Matches, a figure carries a small-sample note. */
export const SMALL_SAMPLE = 3;

/** Whether a figure over `matches` Matches needs the small-sample note. */
export function isSmallSample(matches: number): boolean {
  return matches > 0 && matches < SMALL_SAMPLE;
}

/**
 * One side's input: a Squad Member's filtered Appearances, oldest first,
 * DNFs we quit included (they count in records, not stats), and their
 * Position Groups.
 */
export interface ComparisonSideInput {
  appearances: readonly SquadAppearance[];
  positionGroups: PositionGroupSelection;
}

/** One side of a Recorded Comparison. */
export interface ComparedTotals {
  totals: PlayerTotals;
  /** One point per counted Appearance, oldest first. */
  form: FormPoint[];
  /** Our Club's record in the Matches this side's Appearances count. */
  record: RecordSummary;
  /**
   * Hot or Cold form (CLUBS-40) over all this side's Appearances in its
   * Position Groups, Shared or not: form is the Squad Member's own.
   */
  formIndicator: FormIndicator | null;
}

export interface ComparedSides {
  /** One per input, in order. */
  sides: ComparedTotals[];
  /** Under "Played together" with two sides: Our Club's record in the Shared Matches. */
  shared: RecordSummary | null;
}

/** The Matches both Squad Members made an Appearance in, whatever their positions. */
export function sharedMatchIds(
  a: readonly SquadAppearance[],
  b: readonly SquadAppearance[],
): Set<string> {
  const inB = new Set(b.map((x) => x.matchId));
  return new Set(a.map((x) => x.matchId).filter((id) => inB.has(id)));
}

/**
 * Each side's totals under the scope. "Played together" first narrows both
 * sides to the Shared Matches, then each side counts only its own Position
 * Groups within them; the shared record covers every Shared Match.
 */
export function compareSides(
  inputs: readonly ComparisonSideInput[],
  scope: ComparisonScope,
): ComparedSides {
  const shared =
    scope === "together" && inputs.length === 2
      ? sharedMatchIds(inputs[0].appearances, inputs[1].appearances)
      : null;
  const inScope = (appearances: readonly SquadAppearance[]) =>
    shared ? appearances.filter((a) => shared.has(a.matchId)) : appearances;
  return {
    sides: inputs.map(({ appearances, positionGroups }) => {
      const selected = filterByPositionGroups(
        inScope(appearances),
        positionGroups,
      );
      // Our side's stats in a DNF we quit are left out; its result is not.
      const counted = selected.filter(isCountedAppearance);
      return {
        totals: summariseAppearances(counted),
        form: formSeries(counted),
        record: summariseRecord(selected),
        formIndicator: formIndicator(
          filterByPositionGroups(appearances, positionGroups).filter(
            isCountedAppearance,
          ),
        ),
      };
    }),
    // A Squad Member appears once per Match, so A's Appearances are the Matches.
    shared: shared ? summariseRecord(inScope(inputs[0].appearances)) : null,
  };
}

/**
 * The Squad Members to compare, A first: the IDs that belong to a Squad
 * Member, so an unknown ID leaves its side to the picker.
 */
export function resolveComparisonPlayers(
  ids: readonly string[],
  members: readonly SquadMemberOption[],
): SquadMemberOption[] {
  return ids.flatMap((id) => members.filter((m) => m.playerId === id));
}

interface ComparisonBase {
  /** The whole Squad, Former Squad Members included, for the player switchers. */
  members: SquadMemberOption[];
  /** The zero to two Squad Members compared, A first. */
  players: SquadMemberOption[];
}

export interface RecordedComparison extends ComparisonBase, ComparedSides {}

export interface EaComparison extends ComparisonBase {
  /** Each player's latest EA season totals, or null before their first Snapshot. */
  sides: (EaSeasonTotals | null)[];
}

/** A Comparison from Recorded Appearances in the filtered Matches. Three queries at most, in parallel. */
export async function getComparison(
  db: Db,
  filter: StatsFilter,
  params: ComparisonParams,
): Promise<RecordedComparison> {
  const [members, ...appearances] = await Promise.all([
    listSquadMembers(db),
    ...params.players.map((playerId) =>
      squadAppearances(db, filter, { playerId, includeQuitMatches: true }),
    ),
  ]);
  const players = resolveComparisonPlayers(params.players, members);
  const byPlayer = new Map(params.players.map((id, i) => [id, appearances[i]]));
  const inputs = players.map((player, i) => ({
    appearances: byPlayer.get(player.playerId) ?? [],
    positionGroups: params.positionGroups[COMPARISON_SIDES[i]],
  }));
  return { members, players, ...compareSides(inputs, params.scope) };
}

/** A Comparison of EA's season totals, which the filter and Position Groups cannot narrow. */
export async function getEaComparison(
  db: Db,
  params: ComparisonParams,
): Promise<EaComparison> {
  const [members, totals] = await Promise.all([
    listSquadMembers(db),
    eaMemberTotals(db, { includeFormer: true }),
  ]);
  const players = resolveComparisonPlayers(params.players, members);
  return {
    members,
    players,
    sides: players.map(
      (p) => totals.find((t) => t.playerId === p.playerId)?.season ?? null,
    ),
  };
}
