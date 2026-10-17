/**
 * EA's raw `clubs/matches` shapes, as recorded in `fixtures/ea/`. Every stat
 * is a string, and any field may be missing in a future FC version, so these
 * types describe what we have seen rather than what is guaranteed.
 */

export interface EaMatch {
  matchId: string;
  /** Epoch seconds. */
  timestamp: number;
  timeAgo?: { number: number; unit: string };
  /** Keyed by club ID: Our Club and the Opponent. */
  clubs: Record<string, EaMatchClub>;
  /** `players[clubId][playerId]`; the player ID is EA's stable ID. */
  players: Record<string, Record<string, EaPlayerStats>>;
  aggregate?: Record<string, Record<string, unknown>>;
  [field: string]: unknown;
}

export interface EaMatchClub {
  /** 1 win, 2 loss, 4 draw, 16385 DNF win, 10 DNF loss; "0" in Friendlies. */
  result?: string;
  goals?: string;
  goalsAgainst?: string;
  score?: string;
  wins?: string;
  losses?: string;
  ties?: string;
  winnerByDnf?: string;
  /** "1" League, "3" Playoff, "5" Friendly. */
  matchType?: string;
  details?: { name?: string; clubId?: number; [field: string]: unknown };
  [field: string]: unknown;
}

export interface EaPlayerStats {
  playername?: string;
  /** goalkeeper | defender | midfielder | forward */
  pos?: string;
  [field: string]: string | undefined;
}
