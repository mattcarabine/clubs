/**
 * Recording Matches with chosen Skill Ratings: each Match gets its own
 * Opponent, rated so the gap (our Skill Rating minus the Opponent's) is
 * the one given, or left unknown to EA so the Match stays unrated.
 *
 *   await recordRated(fakeEa, triggerPoll, [
 *     { gap: -150, build: loss() },
 *     { gap: null, build: win() },
 *   ]);
 *
 * The Matches are played now, so each Poll rates them live, one Match a
 * Poll.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { OPPONENT_RATINGS_VARIANT } from "../../app/ea/endpoints.ts";
import type { AddMatchBody } from "../fake-ea/control.ts";
import type { fakeEa as FakeEa } from "./fake-ea.ts";
import { FIXTURES_DIR } from "./match-builders.ts";
import { against } from "./opponent.ts";

/** Our Club's Skill Rating in the recorded `clubs/overallStats`. */
export const OUR_RATING = 1632;

export interface RatedMatch {
  /** Our Skill Rating minus the Opponent's, or null for an Opponent EA does not rate. */
  gap: number | null;
  build: AddMatchBody;
}

export async function recordRated(
  fakeEa: typeof FakeEa,
  triggerPoll: () => Promise<void>,
  games: readonly RatedMatch[],
): Promise<void> {
  const opponents = games.map((_, i) => ({
    clubId: String(980_000 + i),
    name: `Rated Opponent ${i + 1}`,
  }));
  await fakeEa.setPayload(
    "clubs/overallStats",
    games.flatMap(({ gap }, i) =>
      gap === null
        ? []
        : [
            {
              clubId: opponents[i].clubId,
              skillRating: String(OUR_RATING - gap),
            },
          ],
    ),
    OPPONENT_RATINGS_VARIANT,
  );
  // Our rating going into a Match is our Snapshot one game before the one
  // its result changed (CLUBS-88), so each Match needs a Poll of its own
  // with EA's count of our games one higher. The rating itself never moves.
  const [ours] = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, "clubs-overallStats.json"), "utf8"),
  );
  const played = Number(ours.gamesPlayed);
  await triggerPoll();
  for (const [i, { build }] of games.entries()) {
    await fakeEa.setPayload("clubs/overallStats", [
      { ...ours, gamesPlayed: String(played + i + 1) },
    ]);
    await fakeEa.addMatch(against(opponents[i], build));
    await triggerPoll();
  }
}
