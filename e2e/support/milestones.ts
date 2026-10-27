/**
 * Helpers for the Milestone specs (CLUBS-36): Matches with chosen line-ups,
 * EA career totals, and the rows detection leaves in D1.
 */
import type { APIRequestContext } from "@playwright/test";

import type { fakeEa as FakeEa } from "./fake-ea.ts";
import { type MatchOptions, win, withLineup } from "./match-builders.ts";
import { membersPayload } from "./members.ts";

const MINUTE_MS = 60_000;

/** Named after recorded members, so EA's member Snapshots match them by persona name. */
export const KAB = { id: "936000001", name: "Kabeeble" };
export const LOL = { id: "936000002", name: "Loltown95" };

export interface LineupEntry {
  player: { id: string; name: string };
  goals?: number;
  assists?: number;
  rating?: number;
  motm?: boolean;
}

/**
 * Serves a Win (`win` options, e.g. a score) `minutesAgo` minutes ago with
 * this line-up for Our Club. Players are rated 7.0 with no assists unless
 * given. Returns the Match ID.
 */
export async function serveMatch(
  fakeEa: typeof FakeEa,
  matchId: string,
  minutesAgo: number,
  lineup: LineupEntry[],
  options: MatchOptions = {},
): Promise<string> {
  await fakeEa.addMatch(
    withLineup(
      win({
        matchId,
        playedAt: new Date(Date.now() - minutesAgo * MINUTE_MS),
        ...options,
      }),
      lineup.map(({ player, goals = 0, assists = 0, rating = 7, motm }) => ({
        player,
        goals,
        rating,
        stats: { assists: String(assists), mom: motm ? "1" : "0" },
      })),
    ),
  );
  return matchId;
}

/** Sets EA's career totals (`members/career/stats`) for some recorded members. */
export async function serveCareerTotals(
  fakeEa: typeof FakeEa,
  totals: Record<string, Record<string, number>>,
): Promise<void> {
  const overrides = Object.fromEntries(
    Object.entries(totals).map(([name, fields]) => [
      name,
      Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [key, String(value)]),
      ),
    ]),
  );
  await fakeEa.setPayload(
    "members/career/stats",
    membersPayload("members/career/stats", overrides),
  );
}

/**
 * Deletes every Milestone and its comments, as before the release; or, given
 * a kind, only that kind's Milestones, as before the kind was added.
 */
export async function forgetMilestones(
  request: APIRequestContext,
  kind?: string,
): Promise<void> {
  const res = await request.post("/__test/milestones/forget", {
    params: kind ? { kind } : undefined,
  });
  if (!res.ok()) throw new Error(`forget failed: ${res.status()}`);
}

/** Stores kind `from`'s Milestones as kind `to`, e.g. one no longer detected. */
export async function renameMilestones(
  request: APIRequestContext,
  from: string,
  to: string,
): Promise<void> {
  const res = await request.post("/__test/milestones/rename", {
    params: { from, to },
  });
  if (!res.ok()) throw new Error(`rename failed: ${res.status()}`);
}

export interface MilestoneRow {
  id: number;
  kind: string;
  subject: string;
  player_id: string | null;
  value: number;
  threshold: number | null;
  match_id: string;
  batch_key: string;
  dedupe_key: string;
}
