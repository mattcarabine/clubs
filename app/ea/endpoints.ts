/**
 * The EA Pro Clubs endpoints we use, shared by the Poll, the fixture recorder
 * and the fake EA upstream so the three can never disagree on paths or params.
 *
 * Runs under both workerd and Node (docs/adr/0005): relative imports carry a
 * `.ts` extension and nothing here touches Worker-only APIs.
 */

export const MATCH_TYPES = [
  "leagueMatch",
  "playoffMatch",
  "friendlyMatch",
] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const EA_ENDPOINTS = [
  "clubs/matches",
  "members/stats",
  "members/career/stats",
  "clubs/overallStats",
  "clubs/info",
  "currentSeasonLeaderboard/search",
  "club/playoffAchievements",
] as const;
export type EaEndpoint = (typeof EA_ENDPOINTS)[number];

/** Our Club as EA knows it. */
export interface ClubRef {
  platform: string;
  clubId: string;
  clubName: string;
}

export interface EaRequest {
  endpoint: EaEndpoint;
  /** Distinguishes requests to the same endpoint (the Match Type for `clubs/matches`), otherwise "". */
  variant: string;
  /** An array value is sent as a repeated parameter (`clubIds=1&clubIds=2`). */
  query: Record<string, string | readonly string[]>;
}

/** EA silently caps `maxResultCount` at 10 and has no paging (docs/adr/0002). */
export const MAX_MATCHES_PER_TYPE = 10;

export function matchesRequest(club: ClubRef, matchType: MatchType): EaRequest {
  return {
    endpoint: "clubs/matches",
    variant: matchType,
    query: {
      platform: club.platform,
      clubIds: club.clubId,
      matchType,
      maxResultCount: String(MAX_MATCHES_PER_TYPE),
    },
  };
}

function clubRequest(
  club: ClubRef,
  endpoint: EaEndpoint,
  clubParam: "clubId" | "clubIds",
): EaRequest {
  return {
    endpoint,
    variant: "",
    query: { platform: club.platform, [clubParam]: club.clubId },
  };
}

/**
 * The requests one Poll makes, in order. Matches come first: they are the
 * only data that cannot be recovered later if a Poll is cut short.
 */
export function pollRequests(club: ClubRef): EaRequest[] {
  return [
    ...MATCH_TYPES.map((matchType) => matchesRequest(club, matchType)),
    clubRequest(club, "members/stats", "clubId"),
    clubRequest(club, "members/career/stats", "clubId"),
    clubRequest(club, "clubs/overallStats", "clubIds"),
    {
      endpoint: "currentSeasonLeaderboard/search",
      variant: "",
      query: { platform: club.platform, clubName: club.clubName },
    },
  ];
}

/** The `clubs/overallStats` variant that asks for Opponents' ratings. */
export const OPPONENT_RATINGS_VARIANT = "opponents";

/**
 * Several Opponents' `clubs/overallStats` in one request. EA rejects
 * comma-separated `clubIds` here (400 "Invalid query parameter"), but accepts
 * the parameter repeated, and leaves unknown clubs out of the answer (verified
 * against live EA with 12 IDs on 2026-10-17).
 */
export function opponentRatingsRequest(
  platform: string,
  clubIds: readonly string[],
): EaRequest {
  return {
    endpoint: "clubs/overallStats",
    variant: OPPONENT_RATINGS_VARIANT,
    query: { platform, clubIds },
  };
}

/** Everything the fixture recorder captures: the Poll plus reference data. */
export function recordedRequests(club: ClubRef): EaRequest[] {
  return [
    ...pollRequests(club),
    clubRequest(club, "clubs/info", "clubIds"),
    clubRequest(club, "club/playoffAchievements", "clubId"),
  ];
}

export function requestUrl(baseUrl: string, request: EaRequest): string {
  // Encoded by hand: URLSearchParams turns spaces into "+", but the club name
  // must go out as "%20", exactly as the verified curl requests send it.
  const query = Object.entries(request.query)
    .flatMap(([key, value]) =>
      (typeof value === "string" ? [value] : value).map(
        (item) => `${key}=${encodeURIComponent(item)}`,
      ),
    )
    .join("&");
  return `${ensureTrailingSlash(baseUrl)}${request.endpoint}?${query}`;
}

/** File name of a request's recorded Raw Payload in `fixtures/ea/`. */
export function fixtureFileName(
  request: Pick<EaRequest, "endpoint" | "variant">,
): string {
  const base = request.endpoint.replaceAll("/", "-");
  return `${request.variant ? `${base}-${request.variant}` : base}.json`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
