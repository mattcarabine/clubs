/** The Squad Member profile query (CLUBS-10): tracked form plus EA's own build and career figures. */
import type { Db } from "~/db/client";

import type { StatsFilter } from "./filter";
import {
  type BuildChange,
  bestAppearances,
  buildHistory,
  type CareerTotals,
  careerTotals,
  type FormPoint,
  formSeries,
  type PositionGroupSplit,
  positionGroupSplit,
} from "./player";
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
  /** Totals over the filtered Appearances. */
  totals: PlayerTotals;
  /** One point per filtered Appearance, oldest first. */
  form: FormPoint[];
  positionGroups: PositionGroupSplit[];
  /** The 5 highest-rated filtered Appearances, best first. */
  bestMatches: SquadAppearance[];
  /** Build changes from `members/stats` Snapshots, oldest first; not filtered. */
  build: BuildChange[];
  /** The latest `members/career/stats` Snapshot, or null before the first; not filtered. */
  career: CareerTotals | null;
}

/** A Squad Member's profile, or null when the ID has never appeared for Our Club. */
export async function getPlayerProfile(
  db: Db,
  playerId: string,
  filter: StatsFilter,
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
  return {
    member,
    totals: summariseAppearances(appearances),
    form: formSeries(appearances),
    positionGroups: positionGroupSplit(appearances),
    bestMatches: bestAppearances(appearances),
    build: buildHistory(seasonSnapshots),
    career: latestCareer ? careerTotals(latestCareer) : null,
  };
}
