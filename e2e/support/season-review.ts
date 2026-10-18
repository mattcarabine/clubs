/**
 * Seeding a finished Season for the Season Review specs (CLUBS-45): Matches
 * played in Season 1, then a Poll that sees the leaderboard reset, which
 * starts Season 2 and so ends Season 1.
 */
import type { AddMatchBody } from "../fake-ea/control.ts";
import type { fakeEa as FakeEa } from "./fake-ea.ts";
import { leaderboardWithGamesPlayed } from "./leaderboard.ts";
import { draw, loss, win, withLineup } from "./match-builders.ts";
import { against } from "./opponent.ts";

export const KAB = { id: "945000001", name: "Kabeeble" };
export const TREV = { id: "945000002", name: "Trevor" };
export const DAN = { id: "945000003", name: "Dan" };

export const SPARROWS = { clubId: "945100001", name: "Sparrows" };
export const ROBINS = { clubId: "945100002", name: "Robins" };

interface Harness {
  fakeEa: typeof FakeEa;
  triggerPoll: () => Promise<void>;
}

const HOUR_MS = 3_600_000;
const BUILDERS = { W: win, D: draw, L: loss };

interface SeededMatch {
  result: keyof typeof BUILDERS;
  score: [number, number];
  opponent: typeof SPARROWS;
  /** Hours before now. */
  hoursAgo: number;
}

/**
 * Two Sessions, a day apart:
 * - three days ago: W 5–0 Sparrows, L 0–3 Robins, D 1–1 Robins;
 * - two days ago: W 2–1, W 3–1, W 1–0 Sparrows, then L 1–2 Robins.
 *
 * So the Biggest Win is the 5–0, the heaviest defeat the 0–3, the best
 * Session the second (3 Wins), Robins the Nemesis (3 Dropped Points) and
 * Sparrows the favourite (4 Wins). Kabeeble scores every goal at 8.0 in
 * every Match; Trevor assists once a Match at 7.0; Dan plays 6.0 in his
 * first 4 Matches and 8.5 in his last 3. By the Award rules: Kabeeble is
 * Player of the Season, Golden Boot, Ever-present and Hot Streak; Trevor
 * the Playmaker; Dan Most Improved.
 */
export const FULL_SEASON: SeededMatch[] = [
  { result: "W", score: [5, 0], opponent: SPARROWS, hoursAgo: 72 },
  { result: "L", score: [0, 3], opponent: ROBINS, hoursAgo: 71.5 },
  { result: "D", score: [1, 1], opponent: ROBINS, hoursAgo: 71 },
  { result: "W", score: [2, 1], opponent: SPARROWS, hoursAgo: 48 },
  { result: "W", score: [3, 1], opponent: SPARROWS, hoursAgo: 47.5 },
  { result: "W", score: [1, 0], opponent: SPARROWS, hoursAgo: 47 },
  { result: "L", score: [1, 2], opponent: ROBINS, hoursAgo: 46.5 },
];

/** EA's final season totals before the reset: more Matches than we recorded. */
export const EA_FINAL = {
  gamesPlayed: 31,
  wins: 20,
  ties: 4,
  losses: 7,
  goals: 70,
  goalsAgainst: 40,
  promotions: 2,
  relegations: 0,
  bestDivision: 3,
};

function seededMatch(
  { result, score: [goalsFor, goalsAgainst], opponent, hoursAgo }: SeededMatch,
  index: number,
  idPrefix: string,
): AddMatchBody {
  const body = BUILDERS[result]({
    matchId: `${idPrefix}${index + 1}`,
    goalsFor,
    goalsAgainst,
    playedAt: new Date(Date.now() - hoursAgo * HOUR_MS),
  });
  const quiet = { assists: "0", mom: "0" };
  return against(
    opponent,
    withLineup(body, [
      { player: KAB, goals: goalsFor, rating: 8, stats: quiet },
      {
        player: TREV,
        rating: 7,
        stats: { ...quiet, assists: goalsFor > 0 ? "1" : "0" },
      },
      { player: DAN, rating: index < 4 ? 6 : 8.5, stats: quiet },
    ]),
  );
}

/**
 * Serves the Matches and Polls them into Season 1 (with EA's final totals),
 * without ending it. Pass `idPrefix` to keep Match IDs apart between specs.
 */
export async function playSeason(
  { fakeEa, triggerPoll }: Harness,
  matches: SeededMatch[] = FULL_SEASON,
  idPrefix = "9450000000000",
): Promise<string[]> {
  await Promise.all(
    (["leagueMatch", "playoffMatch", "friendlyMatch"] as const).map((type) =>
      fakeEa.setPayload("clubs/matches", [], type),
    ),
  );
  const ids: string[] = [];
  for (const [i, match] of matches.entries()) {
    const body = seededMatch(match, i, idPrefix);
    ids.push(body.match.matchId as string);
    await fakeEa.addMatch(body);
  }
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(EA_FINAL.gamesPlayed, { stats: EA_FINAL }),
  );
  await triggerPoll();
  return ids;
}

/** The Poll that sees EA's season totals reset: Season 2 starts, Season 1 ends. */
export async function endSeason({ fakeEa, triggerPoll }: Harness) {
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(0),
  );
  await triggerPoll();
}

/** The review's Award winners in the seeded Season, in order. */
export const EXPECTED_AWARDS = [
  ["Player of the Season", KAB.name],
  ["Golden Boot", KAB.name],
  ["Playmaker", TREV.name],
  ["Most Improved", DAN.name],
  ["Ever-present", KAB.name],
  ["Hot Streak", KAB.name],
] as const;

export interface SeasonReviewPostRow {
  season: number;
  status: string;
  attempts: number;
  posted_at: number | null;
}
