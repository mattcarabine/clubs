/** The Squad Member profile query (CLUBS-10): tracked form plus EA's own build, season and career totals. */
import type { Db } from "~/db/client";

import {
  type EaCareerTotals,
  type EaSeasonTotals,
  eaCareerTotals,
  eaSeasonTotals,
} from "./ea-totals";
import type { StatsFilter } from "./filter";
import { type PlayerOutcomeSplit, playerOutcomeSplit } from "./outcome-split";
import {
  type BuildChange,
  bestAppearances,
  buildHistory,
  type FormPoint,
  formSeries,
  type PositionGroupSplit,
  positionGroupSplit,
} from "./player";
import {
  ALL_POSITIONS,
  filterByPositionGroups,
  type PositionGroupSelection,
} from "./positions";
import {
  type FormIndicator,
  formIndicator,
  type RecentChanges,
  recentChanges,
} from "./recent-change";
import { memberSnapshots } from "./snapshots";
import {
  getSquadMember,
  type SquadAppearance,
  type SquadMember,
  squadAppearances,
} from "./squad";
import { type PlayerTotals, summariseAppearances } from "./summaries";

export interface PlayerProfile {
  member: SquadMember;
  /** Totals over the filtered Appearances, in the selected Position Groups. */
  totals: PlayerTotals;
  /** One point per filtered Appearance in the selected Position Groups, oldest first. */
  form: FormPoint[];
  /**
   * Every Position Group played in the filtered Matches, whatever the
   * Position Group selection: the overview the selection is picked from.
   */
  positionGroups: PositionGroupSplit[];
  /** The 5 highest-rated filtered Appearances in the selected Position Groups, best first. */
  bestMatches: SquadAppearance[];
  /** Wins against Dropped Points over the filtered Appearances in the selected Position Groups. */
  outcomeSplit: PlayerOutcomeSplit;
  /** The last 10 filtered Appearances in the selected Position Groups against the ones before (CLUBS-37). */
  recentChanges: RecentChanges;
  /** Hot or Cold form over the same Appearances (CLUBS-40), or null for neither. */
  formIndicator: FormIndicator | null;
  /** Build changes from `members/stats` Snapshots, oldest first; not filtered. */
  build: BuildChange[];
  /** The latest `members/career/stats` Snapshot, or null before the first; not filtered. */
  career: EaCareerTotals | null;
  /** The latest `members/stats` Snapshot (this Season), or null before the first; not filtered. */
  season: EaSeasonTotals | null;
}

export interface PlayerProfileOptions {
  /**
   * Count only Appearances in these Position Groups (default: All
   * Positions). Pass `filter.positionGroups` for the global selection.
   */
  positionGroups?: PositionGroupSelection;
}

/** A Squad Member's profile, or null when the ID has never appeared for Our Club. */
export async function getPlayerProfile(
  db: Db,
  playerId: string,
  filter: StatsFilter,
  { positionGroups = ALL_POSITIONS }: PlayerProfileOptions = {},
): Promise<PlayerProfile | null> {
  const [member, appearances, seasonSnapshots, careerSnapshots] =
    await Promise.all([
      getSquadMember(db, playerId),
      squadAppearances(db, filter, { playerId }),
      memberSnapshots(db, playerId, "members/stats"),
      memberSnapshots(db, playerId, "members/career/stats"),
    ]);
  if (!member) return null;
  const latestCareer = careerSnapshots.at(-1);
  const latestSeason = seasonSnapshots.at(-1);
  const selected = filterByPositionGroups(appearances, positionGroups);
  return {
    member,
    totals: summariseAppearances(selected),
    form: formSeries(selected),
    positionGroups: positionGroupSplit(appearances),
    bestMatches: bestAppearances(selected),
    outcomeSplit: playerOutcomeSplit(appearances, positionGroups),
    recentChanges: recentChanges(selected, member.name),
    formIndicator: formIndicator(selected),
    build: buildHistory(seasonSnapshots),
    career: latestCareer ? eaCareerTotals(latestCareer) : null,
    season: latestSeason ? eaSeasonTotals(latestSeason) : null,
  };
}
