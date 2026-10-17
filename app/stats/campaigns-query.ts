/**
 * The Campaign replay for the Trends page (CLUBS-41): three parallel queries
 * (Seasons, every Competitive Match, EA's latest leaderboard Snapshot), then
 * the pure `campaigns.ts`. Not filtered: Campaigns follow the League itself.
 */
import { and, desc, eq } from "drizzle-orm";

import type { Db } from "~/db/client";
import { snapshots } from "~/db/schema";
import { SEASON_SOURCE } from "~/poll/seasons";

import {
  type CampaignReplay,
  type DivisionMismatch,
  divisionMismatch,
  replayCampaigns,
} from "./campaigns";
import { type DivisionNumber, toDivisionNumber } from "./divisions";
import { DEFAULT_STATS_FILTER } from "./filter";
import { listMatches } from "./matches";
import { listSeasons } from "./seasons";
import { snapshotNumber } from "./snapshots";

export interface CampaignProgress extends CampaignReplay {
  /** EA's `currentDivision` in the latest leaderboard Snapshot. */
  eaDivision: DivisionNumber | null;
  /** Set when the tracked Division and EA's disagree outside the Playoffs. */
  mismatch: DivisionMismatch | null;
}

export async function getCampaignProgress(db: Db): Promise<CampaignProgress> {
  const [seasons, matches, eaDivision] = await Promise.all([
    listSeasons(db),
    listMatches(db, DEFAULT_STATS_FILTER, { order: "oldest" }),
    latestEaDivision(db),
  ]);
  // Season 1 began before tracking, so only detected starts (Season 2 on) are known.
  const seasonStarts = seasons
    .filter((s) => s.number > 1)
    .map((s) => s.startedAt);
  const replay = replayCampaigns(matches, seasonStarts);
  return {
    ...replay,
    eaDivision,
    mismatch: divisionMismatch(replay, eaDivision),
  };
}

/** `currentDivision` from Our Club's latest current-season leaderboard Snapshot. */
async function latestEaDivision(db: Db): Promise<DivisionNumber | null> {
  const [latest] = await db
    .select({ stats: snapshots.stats })
    .from(snapshots)
    .where(
      and(eq(snapshots.subject, "club"), eq(snapshots.source, SEASON_SOURCE)),
    )
    .orderBy(desc(snapshots.takenAt), desc(snapshots.id))
    .limit(1);
  return latest
    ? toDivisionNumber(snapshotNumber(latest.stats, "currentDivision"))
    : null;
}
