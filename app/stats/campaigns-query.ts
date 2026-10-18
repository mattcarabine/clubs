/**
 * Campaign queries (CLUBS-41, CLUBS-42): the replay behind the Trends page,
 * the Campaign filter's options and its resolution. Each replays every
 * Competitive Match from the detected Season starts through the pure
 * `campaigns.ts`. Not filtered: Campaigns follow the League itself.
 */
import { and, desc, eq } from "drizzle-orm";

import type { Db } from "~/db/client";
import { snapshots } from "~/db/schema";
import { SEASON_SOURCE } from "~/poll/seasons";

import {
  type CampaignReplay,
  campaignKickoffs,
  type DivisionMismatch,
  divisionMismatch,
  findCampaign,
  replayCampaigns,
} from "./campaigns";
import { type DivisionNumber, toDivisionNumber } from "./divisions";
import { DEFAULT_STATS_FILTER, type StatsFilter } from "./filter";
import { listMatches } from "./matches";
import { listSeasons, type Season } from "./seasons";
import { snapshotNumber } from "./snapshots";

export interface CampaignProgress extends CampaignReplay {
  /** EA's `currentDivision` in the latest leaderboard Snapshot. */
  eaDivision: DivisionNumber | null;
  /** Set when the tracked Division and EA's disagree outside the Playoffs. */
  mismatch: DivisionMismatch | null;
}

export async function getCampaignProgress(db: Db): Promise<CampaignProgress> {
  const [replay, eaDivision] = await Promise.all([
    replayTrackedCampaigns(db),
    latestEaDivision(db),
  ]);
  return {
    ...replay,
    eaDivision,
    mismatch: divisionMismatch(replay, eaDivision),
  };
}

/**
 * How many Campaigns are tracked, for the FilterBar's Campaign chips. Takes
 * the Seasons its caller already has; before a Season start is detected
 * there are no Campaigns, so it skips the replay.
 */
export async function countCampaigns(
  db: Db,
  seasons: readonly Season[],
): Promise<number> {
  if (!seasonStarts(seasons).length) return 0;
  const { campaigns } = await replayTrackedCampaigns(db, seasons);
  return campaigns.length;
}

/**
 * Fills in what the URL alone can't say: the selected Campaign's kick-offs,
 * which `matchScope` needs. An unknown Campaign falls back to none. Without
 * a Campaign it returns the filter as it is, with no queries.
 */
export async function resolveStatsFilter(
  db: Db,
  filter: StatsFilter,
): Promise<StatsFilter> {
  const { campaign } = filter;
  if (!campaign || campaign.kickoffs !== undefined) return filter;
  const { campaigns } = await replayTrackedCampaigns(db);
  const found = findCampaign(campaigns, campaign.ref);
  return {
    ...filter,
    campaign: found
      ? { ref: campaign.ref, kickoffs: campaignKickoffs(found.campaign) }
      : undefined,
  };
}

/** Replays every Competitive Match; pass `seasons` when the caller already has them. */
async function replayTrackedCampaigns(
  db: Db,
  seasons?: readonly Season[],
): Promise<CampaignReplay> {
  const [known, matches] = await Promise.all([
    seasons ?? listSeasons(db),
    listMatches(db, DEFAULT_STATS_FILTER, { order: "oldest" }),
  ]);
  return replayCampaigns(matches, seasonStarts(known));
}

/** Season 1 began before tracking, so only detected starts (Season 2 on) are known. */
function seasonStarts(seasons: readonly Season[]): Date[] {
  return seasons.filter((s) => s.number > 1).map((s) => s.startedAt);
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
