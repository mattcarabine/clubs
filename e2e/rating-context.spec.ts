// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { dnf, type Lineup, win, withLineup } from "./support/match-builders.ts";
import { showSquadColumns } from "./support/squad-columns.ts";
import { expect, test } from "./support/test.ts";

/** Vs team's name in the Squad table's Columns picker. */
const VS_TEAM = "Rating against teammates";

// CLUBS-66: ratings in the context of the team. Vs team on the Squad table
// and Compare, and "Rise and fall together?" on Compare.

const ALPHA = { id: "900000031", name: "Alpha Lifter" };
const BRAVO = { id: "900000032", name: "Bravo Tide" };
const CHARLIE = { id: "900000033", name: "Charlie Tide" };
const DELTA = { id: "900000034", name: "Delta Dropout" };

/** The team's night in each Match: Charlie rates exactly this. */
const NIGHTS = [6, 8, 6.5, 7.5, 5.5, 8.5, 7, 6, 8, 7];
/** Alpha rates 0.6 above the night, give or take; Bravo on it, give or take. */
const ALPHA_NOISE = [0.2, -0.2, 0, 0.2, -0.2, 0, 0.2, -0.2, 0, 0];
const BRAVO_NOISE = [0, 0.2, -0.2, -0.2, 0.2, 0, 0, 0.2, -0.2, 0];

type FakeEa = { addMatch(body: AddMatchBody): Promise<void> };

test.beforeEach(async ({ fakeEa }) => {
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

/** Records Matches oldest first, one a minute, Polling as it goes. */
async function record(
  fakeEa: FakeEa,
  triggerPoll: () => Promise<void>,
  matches: { lineup: Lineup; build?: (playedAt: Date) => AddMatchBody }[],
) {
  for (const [
    i,
    { lineup, build = (playedAt: Date) => win({ playedAt }) },
  ] of matches.entries()) {
    const playedAt = new Date(Date.now() - (matches.length - i) * 60_000);
    await fakeEa.addMatch(withLineup(build(playedAt), lineup));
    // EA lists only the latest 10 Matches, so Poll before any drop off.
    if (i % 5 === 4) await triggerPoll();
  }
  await triggerPoll();
}

/**
 * Ten Matches in which Alpha and Bravo swing with the whole team, Alpha
 * always above it; then the gaps EA leaves, which must change nothing: a
 * dropout's 0 minutes and 3.0, and a Match we rage quit.
 */
async function recordTide(fakeEa: FakeEa, triggerPoll: () => Promise<void>) {
  await record(fakeEa, triggerPoll, [
    ...NIGHTS.map((night, i) => ({
      lineup: [
        { player: ALPHA, rating: night + 0.6 + ALPHA_NOISE[i] },
        { player: BRAVO, rating: night + BRAVO_NOISE[i] },
        { player: CHARLIE, rating: night },
        ...(i === 0
          ? [{ player: DELTA, rating: 3, stats: { secondsPlayed: "0" } }]
          : []),
      ],
    })),
    {
      lineup: [
        { player: ALPHA, rating: 3 },
        { player: BRAVO, rating: 9.5 },
        { player: CHARLIE, rating: 9.5 },
      ],
      build: (playedAt) => dnf({ ourWin: false, playedAt }),
    },
  ]);
}

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

/** One Squad Member's cell in the column with this header. */
async function squadCell(page: Page, name: string, header: string) {
  const table = squadTable(page);
  const headers = await table.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return table
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) })
    .getByRole("cell")
    .nth(index - 1);
}

function riseAndFall(page: Page) {
  return page.getByRole("region", { name: "Rise and fall together?" });
}

test("the Squad table rates each Squad Member against their teammates", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTide(fakeEa, triggerPoll);
  await page.goto("/squad");
  // Vs team is hidden until asked (CLUBS-80).
  await showSquadColumns(page, [VS_TEAM]);
  await expect(await squadCell(page, ALPHA.name, "Vs team")).toHaveText("+0.6");
  await expect(await squadCell(page, BRAVO.name, "Vs team")).toHaveText("−0.3");
  await expect(await squadCell(page, CHARLIE.name, "Vs team")).toHaveText(
    "−0.3",
  );
  await expect(page.getByText("above 0 lifts the team")).toBeVisible();

  // EA totals have no per-Match ratings, so no Vs team.
  await page.goto("/squad?source=ea");
  await expect(
    squadTable(page).getByRole("columnheader", { name: "Vs team" }),
  ).toHaveCount(0);
});

test("a Squad Member who never had a rated teammate shows a dash", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [{ lineup: [{ player: ALPHA }] }]);
  await page.goto("/squad");
  await showSquadColumns(page, [VS_TEAM]);
  await expect(await squadCell(page, ALPHA.name, "Vs team")).toHaveText("–");
});

test("Compare says whether two Squad Members rise and fall together, or with the team", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordTide(fakeEa, triggerPoll);
  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);

  const tape = page.getByRole("table", { name: "Headline stats" });
  const vsTeam = tape.locator("tbody tr").filter({
    has: page.getByRole("rowheader", { name: "Vs team", exact: true }),
  });
  await expect(vsTeam.locator("[data-figure]")).toHaveText(["+0.6", "−0.3"]);

  const panel = riseAndFall(page);
  await expect(panel).toContainText("10 Matches both were rated together");
  const straight = panel.locator("div").filter({ hasText: "Straight up" });
  await expect(straight.first()).toContainText("+0.96");
  await expect(straight.first()).toContainText("Rise and fall together");
  // Take out Charlie's night (the team's) and what is left pulls apart.
  const beyond = panel.locator("div").filter({ hasText: "Beyond the team" });
  await expect(beyond.first()).toContainText("−0.67");
  await expect(beyond.first()).toContainText("Pull opposite ways");
  await expect(panel).toContainText("Mostly the team");
  await expect(panel).toContainText(
    `When ${ALPHA.name} played below their average, ${BRAVO.name} did too in 4 of 4.`,
  );
  await expect(panel).toContainText(
    `When ${BRAVO.name} played below their average, ${ALPHA.name} did too in 4 of 4.`,
  );
  // Ten Matches is a verdict, but a small sample.
  await expect(panel.getByText("Small sample").first()).toBeVisible();

  // On a 375px phone the page never scrolls sideways.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  // EA totals have no per-Match ratings.
  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}&source=ea`);
  await expect(page.locator("h1")).toHaveText("Compare");
  await expect(riseAndFall(page)).toHaveCount(0);
});

test("Compare won't call it on too few Matches together", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    [7, 8, 6].map((night) => ({
      lineup: [
        { player: ALPHA, rating: night },
        { player: BRAVO, rating: night },
      ],
    })),
  );
  await page.goto(`/compare?players=${ALPHA.id},${BRAVO.id}`);
  const panel = riseAndFall(page);
  await expect(panel).toContainText("Too few Matches together to call it");
  await expect(panel).toContainText(
    `${ALPHA.name} and ${BRAVO.name} have 3 rated Matches together; it takes 8.`,
  );
});
