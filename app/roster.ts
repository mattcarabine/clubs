import { env } from "cloudflare:workers";

/**
 * The Roster: hand-maintained overrides for Squad Members, keyed by EA's
 * stable player ID (see `players.player_id`). Everyone who has made an
 * Appearance for Our Club is a Squad Member whether listed here or not; an
 * entry only sets a nickname or marks a Former Squad Member.
 *
 * Example:
 *   "256171605": { nickname: "Kab" },
 *   "380993182": { former: true },
 */
export interface RosterEntry {
  /** Shown instead of the EA persona name. */
  nickname?: string;
  /** Left Our Club: kept in all-time views, hidden from current-squad views. */
  former?: boolean;
}

export const ROSTER: Readonly<Record<string, RosterEntry>> = {};

export function rosterEntry(playerId: string): RosterEntry {
  return ROSTER[playerId] ?? testRoster()[playerId] ?? {};
}

let parsedTestRoster: Readonly<Record<string, RosterEntry>> | undefined;

/**
 * Extra Roster entries for the E2E suite, from the `TEST_ROSTER` var (JSON).
 * Only the `test` Wrangler env sets it, and it is ignored unless the test
 * routes are on, so it can never change the real Roster.
 */
function testRoster(): Readonly<Record<string, RosterEntry>> {
  if (env.TEST_ROUTES !== "1") return {};
  parsedTestRoster ??= JSON.parse(env.TEST_ROSTER ?? "{}");
  return parsedTestRoster ?? {};
}

/** The name to show for a Squad Member: nickname, then persona name, then ID. */
export function displayName(
  playerId: string,
  personaName: string | null,
): string {
  return rosterEntry(playerId).nickname ?? personaName ?? playerId;
}

export function isFormerSquadMember(playerId: string): boolean {
  return rosterEntry(playerId).former === true;
}
