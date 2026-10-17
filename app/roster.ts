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
  return ROSTER[playerId] ?? testRoster[playerId] ?? {};
}

let testRoster: Readonly<Record<string, RosterEntry>> = {};

/**
 * Extra Roster entries for the E2E suite. Only `workers/test-routes.ts` calls
 * this, from the `TEST_ROSTER` var, and only when the test routes are on, so
 * it never changes the real Roster. Kept free of Worker imports because this
 * module also reaches client bundles.
 */
export function setTestRoster(entries: Readonly<Record<string, RosterEntry>>) {
  testRoster = entries;
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
