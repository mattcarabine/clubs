/**
 * Turns EA's raw, all-strings responses into typed values. Pure and
 * runtime-agnostic (docs/adr/0005).
 *
 * EA's API is unofficial: any field may be missing, empty or renamed in a
 * future FC version. Missing numbers become 0 (or null where 0 would lie, such
 * as a rating), and malformed entries are skipped rather than failing a Poll.
 * The `match_event_aggregate_*` counters are not parsed; they stay in the Raw
 * Payload (docs/adr/0003).
 */
import type { EaEndpoint, MatchType } from "./endpoints.ts";
import type { EaMatch, EaMatchClub, EaPlayerStats } from "./types.ts";

export type MatchResult = "win" | "loss" | "draw";

/** Our name for each EA Match Type (CONTEXT.md). */
export type MatchKind = "league" | "playoff" | "friendly";
const MATCH_KINDS: Record<MatchType, MatchKind> = {
  leagueMatch: "league",
  playoffMatch: "playoff",
  friendlyMatch: "friendly",
};

export const POSITION_GROUPS = [
  "goalkeeper",
  "defender",
  "midfielder",
  "forward",
] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

export interface ParsedMatch {
  matchId: string;
  matchType: MatchKind;
  playedAt: Date;
  opponentClubId: string;
  goalsFor: number;
  goalsAgainst: number;
  /** From Our Club's point of view. */
  result: MatchResult;
  dnf: boolean;
  clubs: ParsedClub[];
  appearances: ParsedAppearance[];
}

export interface ParsedClub {
  clubId: string;
  name: string | null;
}

export interface ParsedAppearance {
  playerId: string;
  clubId: string;
  personaName: string | null;
  positionGroup: PositionGroup | null;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  /** Null when EA sent no rating. */
  rating: number | null;
  manOfTheMatch: boolean;
  redCards: number;
  saves: number;
  goalsConceded: number;
  cleanSheet: boolean;
  secondsPlayed: number;
}

/** EA's `clubs[id].result` codes. Friendlies send 0. */
const RESULT_CODES: Record<string, { result: MatchResult; dnf: boolean }> = {
  "1": { result: "win", dnf: false },
  "2": { result: "loss", dnf: false },
  "4": { result: "draw", dnf: false },
  "16385": { result: "win", dnf: true },
  "10": { result: "loss", dnf: true },
};

/** A whole-number stat; anything missing or non-numeric counts as 0. */
export function toInt(value: unknown): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** A decimal stat, or null when missing or non-numeric. */
export function toDecimal(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toPositionGroup(pos: unknown): PositionGroup | null {
  const group = String(pos ?? "").toLowerCase();
  return (POSITION_GROUPS as readonly string[]).includes(group)
    ? (group as PositionGroup)
    : null;
}

/**
 * The result of a Match for one club. Uses EA's result code when it has one;
 * Friendlies (code 0) and unknown codes fall back to the score.
 */
export function matchResult(
  club: EaMatchClub,
  opponent: EaMatchClub,
): { result: MatchResult; dnf: boolean } {
  const known = RESULT_CODES[String(club.result ?? "")];
  if (known) return known;
  const dnf = club.winnerByDnf === "1" || opponent.winnerByDnf === "1";
  const goalsFor = toInt(club.goals);
  const goalsAgainst = toInt(opponent.goals);
  if (goalsFor > goalsAgainst) return { result: "win", dnf };
  if (goalsFor < goalsAgainst) return { result: "loss", dnf };
  return { result: "draw", dnf };
}

/**
 * Parses a `clubs/matches` response from Our Club's point of view. Entries
 * without a match ID, without Our Club or without exactly one Opponent are
 * skipped.
 */
export function parseMatches(
  json: unknown,
  matchType: MatchType,
  ourClubId: string,
): ParsedMatch[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((entry) => {
    const match = parseMatch(entry as EaMatch, matchType, ourClubId);
    return match ? [match] : [];
  });
}

function parseMatch(
  match: EaMatch,
  matchType: MatchType,
  ourClubId: string,
): ParsedMatch | null {
  if (!match || typeof match !== "object" || !match.matchId) return null;
  const clubs = match.clubs ?? {};
  const ours = clubs[ourClubId];
  const opponentIds = Object.keys(clubs).filter((id) => id !== ourClubId);
  if (!ours || opponentIds.length !== 1) return null;
  const opponentClubId = opponentIds[0];
  const opponent = clubs[opponentClubId];

  const appearances = Object.entries(match.players ?? {}).flatMap(
    ([clubId, players]) =>
      Object.entries(players ?? {}).map(([playerId, stats]) =>
        parseAppearance(playerId, clubId, stats ?? {}),
      ),
  );

  return {
    matchId: String(match.matchId),
    matchType: MATCH_KINDS[matchType],
    playedAt: new Date(toInt(match.timestamp) * 1000),
    opponentClubId,
    goalsFor: toInt(ours.goals),
    goalsAgainst: toInt(opponent.goals),
    ...matchResult(ours, opponent),
    clubs: Object.entries(clubs).map(([clubId, club]) => ({
      clubId,
      name: club?.details?.name ?? null,
    })),
    appearances,
  };
}

function parseAppearance(
  playerId: string,
  clubId: string,
  stats: EaPlayerStats,
): ParsedAppearance {
  return {
    playerId,
    clubId,
    personaName: stats.playername || null,
    positionGroup: toPositionGroup(stats.pos),
    goals: toInt(stats.goals),
    assists: toInt(stats.assists),
    shots: toInt(stats.shots),
    passesMade: toInt(stats.passesmade),
    passAttempts: toInt(stats.passattempts),
    tacklesMade: toInt(stats.tacklesmade),
    tackleAttempts: toInt(stats.tackleattempts),
    rating: toDecimal(stats.rating),
    manOfTheMatch: toInt(stats.mom) > 0,
    redCards: toInt(stats.redcards),
    saves: toInt(stats.saves),
    goalsConceded: toInt(stats.goalsconceded),
    cleanSheet: toInt(stats.cleansheetsany) > 0,
    secondsPlayed: toInt(stats.secondsPlayed),
  };
}

/**
 * Season-total entries (members/stats etc.) with numeric strings coerced to
 * numbers and everything else kept as is.
 */
export function coerceStats(
  entry: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).map(([key, value]) => [
      key,
      typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)
        ? Number(value)
        : value,
    ]),
  );
}

/** A numeric field of a Snapshot, or null when EA sent none or a non-number. */
export function snapshotNumber(
  stats: Record<string, unknown>,
  key: string,
): number | null {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Endpoints whose responses are EA's running totals, kept as Snapshots. */
export const SNAPSHOT_ENDPOINTS = [
  "members/stats",
  "members/career/stats",
  "clubs/overallStats",
  "currentSeasonLeaderboard/search",
] as const satisfies readonly EaEndpoint[];
export type SnapshotEndpoint = (typeof SNAPSHOT_ENDPOINTS)[number];

export function isSnapshotEndpoint(
  endpoint: string,
): endpoint is SnapshotEndpoint {
  return (SNAPSHOT_ENDPOINTS as readonly string[]).includes(endpoint);
}

export interface SnapshotEntry {
  subject: "member" | "club";
  /** The member's persona name (EA gives no player ID here) or the club ID. */
  subjectKey: string;
  stats: Record<string, unknown>;
}

/**
 * The per-Squad-Member or per-club totals in a Snapshot endpoint's response.
 * Club endpoints can list other clubs (the leaderboard search matches by
 * name), so only Our Club's entry is kept.
 */
export function parseSnapshotEntries(
  endpoint: SnapshotEndpoint,
  json: unknown,
  ourClubId: string,
): SnapshotEntry[] {
  if (endpoint === "members/stats" || endpoint === "members/career/stats") {
    const members = (json as { members?: unknown } | null)?.members;
    if (!Array.isArray(members)) return [];
    return members.flatMap(
      (member: Record<string, unknown> | null): SnapshotEntry[] => {
        if (typeof member?.name !== "string" || !member.name) return [];
        return [
          {
            subject: "member",
            subjectKey: member.name,
            stats: coerceStats(member),
          },
        ];
      },
    );
  }
  if (!Array.isArray(json)) return [];
  const ours = json.find(
    (club: Record<string, unknown> | null) =>
      String(club?.clubId) === ourClubId,
  );
  if (!ours) return [];
  // `clubInfo` is kit and crest details, not totals; the Raw Payload keeps it.
  const { clubInfo: _clubInfo, ...totals } = ours as Record<string, unknown>;
  return [
    { subject: "club", subjectKey: ourClubId, stats: coerceStats(totals) },
  ];
}
