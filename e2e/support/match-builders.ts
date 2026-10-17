/**
 * Builds new Matches for the fake EA upstream by cloning a recorded one, so
 * every field EA sends is present and realistic. Only club-level results,
 * scores and the players' win/loss flags are rewritten; individual player
 * stats (goals, ratings, ...) stay as recorded.
 *
 *   await fakeEa.addMatch(win());
 *   await fakeEa.addMatch(dnf({ ourWin: false }));
 *   await fakeEa.addMatch(friendly({ goalsFor: 5, goalsAgainst: 5 }));
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { fixtureFileName, type MatchType } from "../../app/ea/endpoints.ts";
import type { EaMatch } from "../../app/ea/types.ts";
import type { AddMatchBody } from "../fake-ea/control.ts";

export const OUR_CLUB_ID = "332191";

export const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  "../../fixtures/ea",
);

/** The recorded league Matches, newest first. */
export function recordedLeagueMatches(): EaMatch[] {
  const file = fixtureFileName({
    endpoint: "clubs/matches",
    variant: "leagueMatch",
  });
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
}

export interface MatchOptions {
  goalsFor?: number;
  goalsAgainst?: number;
  matchType?: MatchType;
  matchId?: string;
  /** Defaults to now, so the Match is newer than every recorded one. */
  playedAt?: Date;
}

type Score = Required<Pick<MatchOptions, "goalsFor" | "goalsAgainst">>;

/** One club's outcome of a Match, from that club's point of view. */
type Outcome = "win" | "loss" | "draw" | "dnfWin" | "dnfLoss" | "friendly";

/** How EA records an Outcome on `clubs[id]` and its players. */
interface OutcomeRecord {
  /** EA's `clubs[id].result` code. */
  result: number;
  /** The W/D/L counter set to "1"; Friendlies set none. */
  counter: "wins" | "losses" | "ties" | null;
  winnerByDnf: boolean;
  /** The Opponent's Outcome of the same Match. */
  opposite: Outcome;
}

const OUTCOMES: Record<Outcome, OutcomeRecord> = {
  win: { result: 1, counter: "wins", winnerByDnf: false, opposite: "loss" },
  loss: { result: 2, counter: "losses", winnerByDnf: false, opposite: "win" },
  draw: { result: 4, counter: "ties", winnerByDnf: false, opposite: "draw" },
  dnfWin: {
    result: 16385,
    counter: "wins",
    winnerByDnf: true,
    opposite: "dnfLoss",
  },
  dnfLoss: {
    result: 10,
    counter: "losses",
    winnerByDnf: false,
    opposite: "dnfWin",
  },
  friendly: {
    result: 0,
    counter: null,
    winnerByDnf: false,
    opposite: "friendly",
  },
};

/** EA's `clubs[id].matchType` codes. */
const MATCH_TYPE_CODE: Record<MatchType, string> = {
  leagueMatch: "1",
  playoffMatch: "3",
  friendlyMatch: "5",
};

let sequence = 0;

export function win(options: MatchOptions = {}): AddMatchBody {
  return buildMatch("win", { goalsFor: 3, goalsAgainst: 1, ...options });
}

export function loss(options: MatchOptions = {}): AddMatchBody {
  return buildMatch("loss", { goalsFor: 1, goalsAgainst: 3, ...options });
}

export function draw(options: MatchOptions = {}): AddMatchBody {
  return buildMatch("draw", { goalsFor: 2, goalsAgainst: 2, ...options });
}

/** A Match ended early; EA gives it to the side that stayed (Our Club by default). */
export function dnf({
  ourWin = true,
  ...options
}: MatchOptions & { ourWin?: boolean } = {}): AddMatchBody {
  return buildMatch(ourWin ? "dnfWin" : "dnfLoss", {
    goalsFor: ourWin ? 3 : 0,
    goalsAgainst: ourWin ? 0 : 3,
    ...options,
  });
}

/** Friendlies report W/D/L and `result` as 0, so only the score says who won. */
export function friendly(options: MatchOptions = {}): AddMatchBody {
  return buildMatch("friendly", {
    goalsFor: 2,
    goalsAgainst: 1,
    ...options,
    matchType: "friendlyMatch",
  });
}

function buildMatch(
  outcome: Outcome,
  options: MatchOptions & Score,
): AddMatchBody {
  sequence += 1;
  const matchType = options.matchType ?? "leagueMatch";
  const playedAt =
    Math.floor((options.playedAt?.getTime() ?? Date.now()) / 1000) + sequence;

  const match = structuredClone(recordedLeagueMatches()[0]);
  match.matchId =
    options.matchId ?? String(900_000_000_000_000 + Date.now() * 10 + sequence);
  match.timestamp = playedAt;
  match.timeAgo = { number: 1, unit: "minute" };

  const opponentId = Object.keys(match.clubs).find((id) => id !== OUR_CLUB_ID);
  if (!opponentId) throw new Error("Recorded match has no Opponent");

  const { goalsFor, goalsAgainst } = options;
  const sides = [
    { clubId: OUR_CLUB_ID, outcome, goals: goalsFor, goalsAgainst },
    {
      clubId: opponentId,
      outcome: OUTCOMES[outcome].opposite,
      goals: goalsAgainst,
      goalsAgainst: goalsFor,
    },
  ];
  for (const side of sides) {
    const { result, counter, winnerByDnf } = OUTCOMES[side.outcome];
    Object.assign(match.clubs[side.clubId], {
      date: String(playedAt),
      matchType: MATCH_TYPE_CODE[matchType],
      goals: String(side.goals),
      goalsAgainst: String(side.goalsAgainst),
      score: String(side.goals),
      result: String(result),
      wins: flag(counter === "wins"),
      losses: flag(counter === "losses"),
      ties: flag(counter === "ties"),
      winnerByDnf: flag(winnerByDnf),
    });
    for (const player of Object.values(match.players[side.clubId] ?? {})) {
      player.wins = flag(counter === "wins");
      player.losses = flag(counter === "losses");
    }
  }
  return { matchType, match };
}

/** EA's boolean fields are the strings "1" and "0". */
function flag(value: boolean): string {
  return value ? "1" : "0";
}

/** Squad Members in a line-up built by `withLineup`. */
export type Lineup = {
  player: { id: string; name: string };
  goals?: number;
  rating?: number;
  /** EA's Position Group for the Appearance, e.g. "forward". */
  pos?: string;
}[];

/**
 * Replaces Our Club's line-up in a built Match. Each player is a copy of a
 * recorded one, so every stat is realistic, with a new ID, name, goals and
 * (optionally) rating and Position Group.
 */
export function withLineup(body: AddMatchBody, lineup: Lineup): AddMatchBody {
  const recorded = body.match.players[OUR_CLUB_ID];
  const template = Object.values(recorded)[0];
  body.match.players[OUR_CLUB_ID] = Object.fromEntries(
    lineup.map(({ player, goals = 0, rating, pos = template.pos }) => [
      player.id,
      {
        ...template,
        playername: player.name,
        goals: String(goals),
        rating: rating === undefined ? template.rating : rating.toFixed(2),
        pos,
      },
    ]),
  );
  return body;
}

/** Every Appearance on both sides lasts `minutes`: how long the Match ran (45 for a DNF at half time). */
export function lasting(body: AddMatchBody, minutes: number): AddMatchBody {
  for (const side of Object.values(body.match.players)) {
    for (const player of Object.values(side)) {
      player.secondsPlayed = String(minutes * 60);
    }
  }
  return body;
}

/**
 * Gives a club exactly `shots` in the Match, all to its first player, and no
 * goals, so only shots differ between the Matches built with it.
 */
export function withShots(
  body: AddMatchBody,
  shots: number,
  club: "ours" | "opponent" = "ours",
): AddMatchBody {
  const clubId = Object.keys(body.match.players).find(
    (id) => (id === OUR_CLUB_ID) === (club === "ours"),
  );
  if (!clubId) throw new Error(`Built Match has no ${club} players`);
  Object.values(body.match.players[clubId]).forEach((player, i) => {
    player.shots = String(i === 0 ? shots : 0);
    player.goals = "0";
  });
  return body;
}

/**
 * Gives Our Club exactly `shots` and zeroes every other count (goals, the
 * Opponent's shots, saves, red cards) on both sides, so per 90 only our shots can differ
 * between Matches of different lengths.
 */
export function withOnlyShots(body: AddMatchBody, shots: number): AddMatchBody {
  withShots(withShots(body, 0, "opponent"), shots);
  for (const side of Object.values(body.match.players)) {
    for (const player of Object.values(side)) {
      player.saves = "0";
      player.redcards = "0";
    }
  }
  return body;
}
