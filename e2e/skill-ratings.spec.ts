import { recordedLeagueMatches, win } from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-28: the Match and Opponent pages show Skill Ratings, or nothing.

/** The builders' Opponent and its recorded Skill Rating. */
const CLUB_X = { clubId: "356611", name: "Bunch of bums", rating: "1420" };
/** Our Club's recorded Skill Rating. */
const OUR_RATING = "1632";

test("a rated Match shows both Skill Ratings beside the score, and its Opponent the latest", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(win({ matchId: "28001" }));
  await triggerPoll();

  await page.goto("/matches/28001");
  const score = page.getByRole("region", { name: "Score" });
  // CLUBS-31: each rating sits under its club's name in the hero.
  await expect(score.getByText(`Skill rating ${OUR_RATING}`)).toBeVisible();
  await expect(score.getByText(`Skill rating ${CLUB_X.rating}`)).toBeVisible();
  await expect(
    score.getByText(
      `Skill ratings at this Match: A Bloo Bloo ${OUR_RATING}, ${CLUB_X.name} ${CLUB_X.rating}`,
    ),
  ).toBeAttached();

  await page.goto(`/opponents/${CLUB_X.clubId}`);
  const header = page.getByRole("main").locator("header");
  await expect(header.getByText("Skill rating")).toBeVisible();
  await expect(header.getByText(CLUB_X.rating, { exact: true })).toBeVisible();
});

test("a Match without ratings, and its Opponent, show none", async ({
  page,
  triggerPoll,
}) => {
  // The recorded Matches predate the first Poll, so they are not rated yet.
  await triggerPoll();
  const [match] = recordedLeagueMatches();

  await page.goto(`/matches/${match.matchId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/skill rating/i)).toHaveCount(0);

  await page.goto(`/opponents/${CLUB_X.clubId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/skill rating/i)).toHaveCount(0);
});
