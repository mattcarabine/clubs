/**
 * EA's own totals per Squad Member (CLUBS-19), read from the latest
 * `members/stats` (this Season) and `members/career/stats` Snapshots. EA counts
 * Matches from before tracking began, so these sit apart from our recorded
 * Appearances and the `StatsFilter` never narrows them. EA sends no per-Match
 * figures or minutes, so nothing here feeds per-90s or Form.
 */
import { and, eq, inArray, isNotNull, max } from "drizzle-orm";

import type { Db } from "~/db/client";
import { players, snapshots } from "~/db/schema";
import { toPositionGroup as parsePositionGroup } from "~/ea/parse";
import type { PositionGroup } from "~/lib/domain";
import { displayName, isFormerSquadMember } from "~/roster";

import { toPositionGroup } from "./convert";
import { type SnapshotPoint, snapshotNumber } from "./snapshots";

const SEASON_SOURCE = "members/stats";
const CAREER_SOURCE = "members/career/stats";

/** EA's record for a Squad Member since the club was founded (`members/career/stats`). */
export interface EaCareerTotals {
  takenAt: Date;
  gamesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  manOfTheMatch: number | null;
  averageRating: number | null;
  /** The Position Group EA says they play most. */
  favouritePosition: PositionGroup | null;
}

/** EA's totals for the current Season (`members/stats`). Rates are 0 to 100. */
export interface EaSeasonTotals {
  takenAt: Date;
  gamesPlayed: number | null;
  winRate: number | null;
  goals: number | null;
  assists: number | null;
  shotSuccessRate: number | null;
  passesMade: number | null;
  passSuccessRate: number | null;
  tacklesMade: number | null;
  tackleSuccessRate: number | null;
  cleanSheetsGoalkeeper: number | null;
  cleanSheetsDefender: number | null;
  manOfTheMatch: number | null;
  redCards: number | null;
  averageRating: number | null;
  favouritePosition: PositionGroup | null;
}

export function eaCareerTotals({
  takenAt,
  stats,
}: SnapshotPoint): EaCareerTotals {
  const n = (key: string) => snapshotNumber(stats, key);
  return {
    takenAt,
    gamesPlayed: n("gamesPlayed"),
    goals: n("goals"),
    assists: n("assists"),
    manOfTheMatch: n("manOfTheMatch"),
    averageRating: n("ratingAve"),
    favouritePosition: favouritePosition(stats),
  };
}

export function eaSeasonTotals({
  takenAt,
  stats,
}: SnapshotPoint): EaSeasonTotals {
  const n = (key: string) => snapshotNumber(stats, key);
  return {
    takenAt,
    gamesPlayed: n("gamesPlayed"),
    winRate: n("winRate"),
    goals: n("goals"),
    assists: n("assists"),
    shotSuccessRate: n("shotSuccessRate"),
    passesMade: n("passesMade"),
    passSuccessRate: n("passSuccessRate"),
    tacklesMade: n("tacklesMade"),
    tackleSuccessRate: n("tackleSuccessRate"),
    cleanSheetsGoalkeeper: n("cleanSheetsGK"),
    cleanSheetsDefender: n("cleanSheetsDef"),
    manOfTheMatch: n("manOfTheMatch"),
    redCards: n("redCards"),
    averageRating: n("ratingAve"),
    favouritePosition: favouritePosition(stats),
  };
}

/**
 * The clean sheets that fit how a Squad Member plays: as Goalkeeper for a
 * keeper, as Defender for anyone else. EA keeps the two apart, and an
 * outfielder's Goalkeeper count is noise.
 */
export function eaCleanSheets(season: EaSeasonTotals): number | null {
  return season.favouritePosition === "Goalkeeper"
    ? season.cleanSheetsGoalkeeper
    : season.cleanSheetsDefender;
}

/** One Squad Member's latest EA totals; either side is null before its first Snapshot. */
export interface EaMemberTotals {
  playerId: string;
  name: string;
  former: boolean;
  positionGroup: PositionGroup | null;
  season: EaSeasonTotals | null;
  career: EaCareerTotals | null;
}

export interface EaMemberTotalsOptions {
  /** Include Former Squad Members (default: current squad only). */
  includeFormer?: boolean;
}

/**
 * The latest season and career Snapshot for every Squad Member EA has sent
 * totals for, most season games first. One query: each member's newest row
 * per source, joined to their persona name.
 */
export async function eaMemberTotals(
  db: Db,
  { includeFormer = false }: EaMemberTotalsOptions = {},
): Promise<EaMemberTotals[]> {
  const latest = db
    .select({ id: max(snapshots.id) })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.subject, "member"),
        inArray(snapshots.source, [SEASON_SOURCE, CAREER_SOURCE]),
        isNotNull(snapshots.playerId),
      ),
    )
    .groupBy(snapshots.source, snapshots.playerId);
  const rows = await db
    .select({
      playerId: players.playerId,
      personaName: players.personaName,
      source: snapshots.source,
      takenAt: snapshots.takenAt,
      stats: snapshots.stats,
    })
    .from(snapshots)
    .innerJoin(players, eq(players.playerId, snapshots.playerId))
    .where(inArray(snapshots.id, latest));

  const byPlayer = new Map<string, EaMemberTotals>();
  for (const { playerId, personaName, source, ...point } of rows) {
    const member = byPlayer.get(playerId) ?? {
      playerId,
      name: displayName(playerId, personaName),
      former: isFormerSquadMember(playerId),
      positionGroup: null,
      season: null,
      career: null,
    };
    if (source === SEASON_SOURCE) member.season = eaSeasonTotals(point);
    else member.career = eaCareerTotals(point);
    member.positionGroup =
      member.season?.favouritePosition ??
      member.career?.favouritePosition ??
      null;
    byPlayer.set(playerId, member);
  }
  return [...byPlayer.values()]
    .filter((member) => includeFormer || !member.former)
    .sort(
      (a, b) =>
        (b.season?.gamesPlayed ?? -1) - (a.season?.gamesPlayed ?? -1) ||
        a.name.localeCompare(b.name),
    );
}

function favouritePosition(
  stats: Record<string, unknown>,
): PositionGroup | null {
  return toPositionGroup(parsePositionGroup(stats.favoritePosition));
}
