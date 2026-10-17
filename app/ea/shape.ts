/**
 * Checks that an EA response still has every field the Poll and the stats
 * pages read. `parse.ts` tolerates missing fields (it falls back to 0 or null
 * so a Poll never fails), which means a renamed field would quietly zero a
 * stat. This check is the loud counterpart, run by `pnpm test:live` against
 * live EA and by unit tests against `fixtures/ea/`.
 *
 * Pure and runtime-agnostic (docs/adr/0005).
 */
import type { EaEndpoint } from "./endpoints.ts";

/** Per-club fields of a `clubs/matches` entry that `parseMatches` reads. */
export const MATCH_CLUB_FIELDS = ["result", "goals"] as const;

/** Per-player fields of a `clubs/matches` entry that `parseMatches` reads. */
export const MATCH_PLAYER_FIELDS = [
  "playername",
  "pos",
  "goals",
  "assists",
  "shots",
  "passesmade",
  "passattempts",
  "tacklesmade",
  "tackleattempts",
  "rating",
  "mom",
  "redcards",
  "saves",
  "goalsconceded",
  "cleansheetsany",
  "secondsPlayed",
] as const;

/** Snapshot fields read by `app/stats/` and `app/poll/seasons.ts`, per endpoint. */
export const SNAPSHOT_FIELDS = {
  "members/stats": ["name", "proOverall", "proPos"],
  "members/career/stats": [
    "name",
    "gamesPlayed",
    "goals",
    "assists",
    "manOfTheMatch",
    "ratingAve",
  ],
  "clubs/overallStats": [
    "clubId",
    "skillRating",
    "wins",
    "ties",
    "losses",
    "wstreak",
    "unbeatenstreak",
  ],
  "currentSeasonLeaderboard/search": [
    "clubId",
    "gamesPlayed",
    "currentDivision",
  ],
} as const;

/** Fields of an Opponent's `clubs/overallStats` entry that the Poll reads. */
export const OPPONENT_RATING_FIELDS = ["clubId", "skillRating"] as const;

type JsonObject = Record<string, unknown>;

/**
 * Every way `json` differs from what we read for `endpoint`, as readable
 * messages naming the path of the missing field, e.g.
 * `clubs/matches[0].players.332191.1001: missing "rating"`. Empty when the
 * shape is as expected. Endpoints we never parse always pass.
 */
export function payloadShapeProblems(
  endpoint: EaEndpoint,
  json: unknown,
  ourClubId: string,
): string[] {
  switch (endpoint) {
    case "clubs/matches":
      return matchesProblems(json, ourClubId);
    case "members/stats":
    case "members/career/stats":
      return membersProblems(endpoint, json);
    case "clubs/overallStats":
    case "currentSeasonLeaderboard/search":
      return clubTotalsProblems(endpoint, json, ourClubId);
    default:
      return [];
  }
}

function matchesProblems(json: unknown, ourClubId: string): string[] {
  if (!Array.isArray(json)) return ["clubs/matches: expected an array"];
  return json.flatMap((entry: unknown, i) => {
    const at = `clubs/matches[${i}]`;
    if (!isRecord(entry)) return [`${at}: expected an object`];
    const problems = missing(at, entry, ["matchId", "timestamp"]);

    const clubs = entry.clubs;
    if (!isRecord(clubs)) return [...problems, `${at}: missing "clubs"`];
    if (!isRecord(clubs[ourClubId]))
      problems.push(`${at}.clubs: missing Our Club (${ourClubId})`);
    const clubCount = Object.keys(clubs).length;
    if (clubCount !== 2)
      problems.push(`${at}.clubs: expected 2 clubs, got ${clubCount}`);
    for (const [clubId, club] of Object.entries(clubs)) {
      if (!isRecord(club)) {
        problems.push(`${at}.clubs.${clubId}: expected an object`);
        continue;
      }
      problems.push(
        ...missing(`${at}.clubs.${clubId}`, club, MATCH_CLUB_FIELDS),
      );
      if (!isRecord(club.details) || typeof club.details.name !== "string")
        problems.push(`${at}.clubs.${clubId}: missing "details.name"`);
    }

    const players = entry.players;
    if (!isRecord(players)) return [...problems, `${at}: missing "players"`];
    if (!isRecord(players[ourClubId]))
      problems.push(`${at}.players: missing Our Club (${ourClubId})`);
    for (const [clubId, squad] of Object.entries(players)) {
      if (!isRecord(squad)) continue;
      for (const [playerId, stats] of Object.entries(squad)) {
        const path = `${at}.players.${clubId}.${playerId}`;
        problems.push(
          ...(isRecord(stats)
            ? missing(path, stats, MATCH_PLAYER_FIELDS)
            : [`${path}: expected an object`]),
        );
      }
    }
    return problems;
  });
}

function membersProblems(
  endpoint: "members/stats" | "members/career/stats",
  json: unknown,
): string[] {
  const members = isRecord(json) ? json.members : undefined;
  if (!Array.isArray(members)) return [`${endpoint}: missing "members" array`];
  if (members.length === 0) return [`${endpoint}: "members" is empty`];
  return members.flatMap((member: unknown, i) =>
    isRecord(member)
      ? missing(`${endpoint}.members[${i}]`, member, SNAPSHOT_FIELDS[endpoint])
      : [`${endpoint}.members[${i}]: expected an object`],
  );
}

function clubTotalsProblems(
  endpoint: "clubs/overallStats" | "currentSeasonLeaderboard/search",
  json: unknown,
  ourClubId: string,
): string[] {
  if (!Array.isArray(json)) return [`${endpoint}: expected an array`];
  const index = json.findIndex(
    (club: unknown) => isRecord(club) && String(club.clubId) === ourClubId,
  );
  if (index === -1)
    return [`${endpoint}: no entry for Our Club (${ourClubId})`];
  return missing(
    `${endpoint}[${index}]`,
    json[index],
    SNAPSHOT_FIELDS[endpoint],
  );
}

/**
 * Problems with an Opponents' `clubs/overallStats` response: it must list at
 * least one of the requested clubs, each with a skill rating. A requested club
 * may be missing (EA leaves out clubs it no longer knows).
 */
export function opponentRatingsProblems(
  json: unknown,
  clubIds: readonly string[],
): string[] {
  const at = "clubs/overallStats (Opponents)";
  if (!Array.isArray(json)) return [`${at}: expected an array`];
  const entries = json.filter(
    (club: unknown) => isRecord(club) && clubIds.includes(String(club.clubId)),
  );
  if (entries.length === 0) return [`${at}: none of the requested clubs`];
  return entries.flatMap((club: JsonObject) =>
    missing(`${at}[${club.clubId}]`, club, OPPONENT_RATING_FIELDS),
  );
}

function missing(
  path: string,
  value: JsonObject,
  fields: readonly string[],
): string[] {
  return fields
    .filter((field) => value[field] === undefined || value[field] === null)
    .map((field) => `${path}: missing "${field}"`);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
