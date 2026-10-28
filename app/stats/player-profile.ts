/** The Squad Member profile query (CLUBS-10): tracked form plus EA's own build, season and career totals. */
import type { Db } from "~/db/client";
import type { PositionGroup } from "~/lib/domain";

import {
  type EaCareerTotals,
  type EaSeasonTotals,
  eaCareerTotals,
  eaSeasonTotals,
} from "./ea-totals";
import type { StatsFilter } from "./filter";
import {
  type PlayerOutcomeSplit,
  playerOutcomeSplit,
  playerRatingProfile,
  type Swing,
} from "./outcome-split";
import {
  type BuildChange,
  bestAppearances,
  buildHistory,
  type FormPoint,
  formSeries,
  type PositionGroupSplit,
  positionGroupSplit,
} from "./player";
import { inMainPosition, mainPosition } from "./positions";
import type { Consistency } from "./rating-context";
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
  /** Totals over the filtered Appearances, in the Main Position when asked. */
  totals: PlayerTotals;
  /** One point per counted Appearance (filtered, and in the Main Position when asked), oldest first. */
  form: FormPoint[];
  /**
   * Every Position Group played in the filtered Matches, whatever
   * "Main position only" says: the overview the Main Position comes from.
   */
  positionGroups: PositionGroupSplit[];
  /** The Position Group they played most in the filtered Matches (CLUBS-82), or null. */
  mainPosition: PositionGroup | null;
  /** The 5 highest-rated counted Appearances, best first. */
  bestMatches: SquadAppearance[];
  /** Wins against Dropped Points over the counted Appearances. */
  outcomeSplit: PlayerOutcomeSplit;
  /** Our record when they rate above their own average against below it (CLUBS-70), same Appearances. */
  swing: Swing;
  /** Their Floor and Spread over the same Appearances (CLUBS-74). */
  consistency: Consistency;
  /** The last 10 counted Appearances against the ones before (CLUBS-37). */
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
   * Count only Appearances in their Main Position (default: every
   * Appearance). Pass `filter.mainPositionOnly`.
   */
  mainPositionOnly?: boolean;
}

/** A Squad Member's profile, or null when the ID has never appeared for Our Club. */
export async function getPlayerProfile(
  db: Db,
  playerId: string,
  filter: StatsFilter,
  { mainPositionOnly = false }: PlayerProfileOptions = {},
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
  const selected = inMainPosition(appearances, mainPositionOnly);
  return {
    member,
    totals: summariseAppearances(selected),
    form: formSeries(selected),
    positionGroups: positionGroupSplit(appearances),
    mainPosition: mainPosition(appearances),
    bestMatches: bestAppearances(selected),
    outcomeSplit: playerOutcomeSplit(appearances, mainPositionOnly),
    ...playerRatingProfile(selected),
    recentChanges: recentChanges(selected, member.name),
    formIndicator: formIndicator(selected),
    build: buildHistory(seasonSnapshots),
    career: latestCareer ? eaCareerTotals(latestCareer) : null,
    season: latestSeason ? eaSeasonTotals(latestSeason) : null,
  };
}
