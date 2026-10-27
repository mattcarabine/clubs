import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  type Lineup,
  loss,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-74: Floor (the rating reached in 4 of 5 Matches) and Spread (how far
// ratings wander), beside Swing on Analysis, on Compare and on the profile.

const ROCK = { id: "900000051", name: "Rock Steady" };
const SWINGY = { id: "900000052", name: "Swingy Sid" };

type FakeEa = { addMatch(body: AddMatchBody): Promise<void> };

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/**
 * Three Wins and three defeats. Rock rates 7.5 to 8 whatever the result
 * (Floor 7.6, Spread 0.17); Swingy rates 9 in Wins and 6 in defeats (Floor
 * 6.0, Spread 1.50). Then a Match we rage quit, which must change nothing.
 */
async function recordRockAndSwingy(
  fakeEa: FakeEa,
  triggerPoll: () => Promise<void>,
) {
  const rock = [7.5, 7.8, 8, 7.6, 7.9, 7.7];
  const matches: { build: (playedAt: Date) => AddMatchBody; lineup: Lineup }[] =
    rock.map((rating, i) => {
      const won = i % 2 === 0;
      return {
        build: (playedAt) => (won ? win({ playedAt }) : loss({ playedAt })),
        lineup: [
          { player: ROCK, rating },
          { player: SWINGY, rating: won ? 9 : 6 },
        ],
      };
    });
  matches.push({
    build: (playedAt) => dnf({ ourWin: false, playedAt }),
    lineup: [
      { player: ROCK, rating: 3 },
      { player: SWINGY, rating: 10 },
    ],
  });
  for (const [i, { build, lineup }] of matches.entries()) {
    const playedAt = new Date(Date.now() - (matches.length - i) * 60_000);
    await fakeEa.addMatch(withLineup(build(playedAt), lineup));
    // EA lists only the latest 10 Matches, so Poll before any drop off.
    if (i % 5 === 4) await triggerPoll();
  }
  await triggerPoll();
}

/** One Squad Member's cell under a header in a table. */
async function cell(page: Page, table: string, name: string, header: string) {
  const grid = page.getByRole("table", { name: table });
  const headers = await grid.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return grid
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name }) })
    .getByRole("cell")
    .nth(index - 1);
}

const ANALYSIS_TABLE = "Squad Members in Wins against draws and defeats";

/** One stat's row in Compare's tale of the tape. */
function tapeRow(page: Page, label: string) {
  return page
    .getByRole("table", { name: "Headline stats" })
    .locator("tbody tr")
    .filter({
      has: page.getByRole("rowheader", { name: label, exact: true }),
    });
}

test("Analysis shows each Squad Member's Floor and Spread beside Swing", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRockAndSwingy(fakeEa, triggerPoll);
  await page.goto("/analysis");

  const rockFloor = await cell(page, ANALYSIS_TABLE, ROCK.name, "Floor");
  await expect(rockFloor).toContainText("7.6");
  await expect(rockFloor).toContainText("Small sample");
  await expect(
    await cell(page, ANALYSIS_TABLE, ROCK.name, "Spread"),
  ).toHaveText("0.17");
  await expect(
    await cell(page, ANALYSIS_TABLE, SWINGY.name, "Floor"),
  ).toContainText("6.0");
  await expect(
    await cell(page, ANALYSIS_TABLE, SWINGY.name, "Spread"),
  ).toHaveText("1.50");
  // Swingy decides results; Rock is consistently good.
  await expect(
    await cell(page, ANALYSIS_TABLE, SWINGY.name, "Swing"),
  ).toContainText("+100 pts");
  await expect(page.getByText("High is reliably good.")).toBeVisible();
});

test("Compare's tale of the tape leads on the higher Floor and the lower Spread", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRockAndSwingy(fakeEa, triggerPoll);
  await page.goto(`/compare?players=${ROCK.id},${SWINGY.id}`);
  const row = (label: string) => tapeRow(page, label);
  await expect(row("Floor").locator("[data-figure]")).toHaveText([
    "7.6",
    "6.0",
  ]);
  await expect(row("Spread").locator("[data-figure]")).toHaveText([
    "0.17",
    "1.50",
  ]);
  for (const label of ["Floor", "Spread"]) {
    await expect(row(label).getByRole("cell").first()).toHaveAttribute(
      "data-leader",
      "true",
    );
  }
});

test("the profile says the Floor and Spread in a sentence", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordRockAndSwingy(fakeEa, triggerPoll);
  await page.goto(`/players/${ROCK.id}`);
  const panel = page.getByRole("region", { name: "Wins vs Dropped Points" });
  await expect(panel).toContainText(
    "They rate 7.6 or better in 4 of 5 Matches, give or take 0.17.",
  );
});

test("under 5 rated Appearances there is no Floor or Spread", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  for (const [i, rating] of [7, 8, 6, 7].entries()) {
    const playedAt = new Date(Date.now() - (4 - i) * 60_000);
    await fakeEa.addMatch(
      withLineup(win({ playedAt }), [
        { player: ROCK, rating },
        { player: SWINGY, rating },
      ]),
    );
  }
  await triggerPoll();
  await page.goto(`/compare?players=${ROCK.id},${SWINGY.id}`);
  await expect(tapeRow(page, "Floor").locator("[data-figure]")).toHaveText([
    "–",
    "–",
  ]);

  await page.goto(`/players/${ROCK.id}`);
  await expect(page.getByText(/or better in 4 of 5 Matches/)).toHaveCount(0);
});
