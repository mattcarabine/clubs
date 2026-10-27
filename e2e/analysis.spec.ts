// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import { leaderboardWithGamesPlayed } from "./support/leaderboard.ts";
import {
  dnf,
  draw,
  lasting,
  loss,
  win,
  withLineup,
  withShots,
} from "./support/match-builders.ts";
import { daysAgo, type Fake, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-25: /analysis, the Outcome Split of Wins against Dropped Points, and
// the profile's "Wins vs Dropped Points" panel.

/** Squad Members that exist only in these specs. */
const STAR = { id: "900000021", name: "Star Striker" };
const ROCK = { id: "900000022", name: "Rock Keeper" };
const BENCH = { id: "900000023", name: "Bench Warmer" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function findings(page: Page) {
  return page.getByRole("list", { name: "Top findings" }).getByRole("listitem");
}

function barList(page: Page, name: string) {
  return page.getByRole("list", { name }).getByRole("listitem");
}

/** The row of a table whose row header matches `name`. */
function tableRow(page: Page, table: string, name: string | RegExp) {
  return page
    .getByRole("table", { name: table })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name }) });
}

/** 3 Wins and 3 losses, a day apart, a full 90 minutes each. */
function basicSplit(): AddMatchBody[] {
  return [
    ...[1, 2, 3].map((i) => lasting(win(daysAgo(10 - i)), 90)),
    ...[4, 5, 6].map((i) => lasting(loss(daysAgo(10 - i)), 90)),
  ];
}

test("with no Matches it says how many more are needed and shows no findings", async ({
  page,
}) => {
  await page.goto("/analysis");
  await expect(page.getByText("Not enough Matches yet")).toBeVisible();
  await expect(
    page.getByText("3 more Wins and 3 more draws or defeats", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(region(page, "Top findings")).toHaveCount(0);
});

test("with fewer than 3 draws or defeats it says how many more are needed", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    win(daysAgo(5)),
    win(daysAgo(4)),
    win(daysAgo(3)),
    loss(daysAgo(2)),
    loss(daysAgo(1)),
  ]);

  await page.goto("/analysis");
  await expect(page.getByText("Not enough Matches yet")).toBeVisible();
  await expect(page.getByText(": 1 more draw or defeat.")).toBeVisible();
  await expect(findings(page)).toHaveCount(0);
});

test("the top finding names shots with both per-90 values and the counts", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Only shots differ: 12 in every Win, 9 in every loss.
  const wins = [9, 8, 7].map((d) =>
    withShots(lasting(win(daysAgo(d)), 90), 12),
  );
  const losses = [6, 5, 4].map((d) =>
    withShots(lasting(loss(daysAgo(d)), 90), 9),
  );
  await record(fakeEa, triggerPoll, [...wins, ...losses]);

  await page.goto("/analysis");
  const top = findings(page).first();
  await expect(top).toContainText(
    "In draws and defeats we take 3.0 fewer shots per 90 than in Wins (9.0 vs 12.0)",
  );
  await expect(top).toContainText("3 Wins, 3 draws and defeats");
  await expect(top).not.toContainText("Dropped Points");
  await expect(top).toContainText("Small sample");
});

test("draws count as Dropped Points and DNF Matches count by their outcome", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    win(daysAgo(6)),
    win(daysAgo(5)),
    dnf({ ourWin: true, ...daysAgo(4) }),
    draw(daysAgo(3)),
    dnf({ ourWin: false, ...daysAgo(2) }),
  ]);

  // 3 Wins (one a DNF) and 2 Dropped Points (a draw and a DNF loss).
  await page.goto("/analysis");
  await expect(page.getByText(": 1 more draw or defeat.")).toBeVisible();

  await fakeEa.addMatch(draw(daysAgo(1)));
  await triggerPoll();
  await page.reload();
  await expect(region(page, "Top findings")).toContainText(
    "3 Wins and 3 draws and defeats",
  );
});

test("a DNF stopped at 45 minutes adds per-90 values, not raw totals", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[7, 6, 5].map((d) => withShots(lasting(win(daysAgo(d)), 90), 10)),
    // 5 shots in 45 minutes is 10 per 90; a raw average would give 8.75.
    withShots(lasting(dnf({ ourWin: true, ...daysAgo(4) }), 45), 5),
    ...[3, 2, 1].map((d) => withShots(lasting(loss(daysAgo(d)), 90), 4)),
  ]);

  await page.goto("/analysis");
  const shots = tableRow(
    page,
    "Performance in Wins against draws and defeats",
    "Shots per 90",
  );
  await expect(shots.getByRole("cell").nth(0)).toHaveText("10.0");
  await expect(shots.getByRole("cell").nth(1)).toHaveText("4.0");
});

test("findings from 10 Matches a side drop the Small sample mark", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const builds = Array.from({ length: 20 }, (_, i) =>
    i < 10
      ? withShots(lasting(win(daysAgo(30 - i)), 90), 12)
      : withShots(lasting(loss(daysAgo(30 - i)), 90), 9),
  );
  await record(fakeEa, triggerPoll, builds);

  await page.goto("/analysis");
  const top = findings(page).first();
  await expect(top).toContainText(
    "fewer shots per 90 than in Wins (9.0 vs 12.0)",
  );
  await expect(top).toContainText("10 Wins, 10 draws and defeats");
  await expect(top).not.toContainText("Small sample");
});

test("a Squad Member who plays only in Wins shows 100% with and 0% without", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(fakeEa, triggerPoll, [
    ...[6, 5, 4].map((d) =>
      withLineup(win(daysAgo(d)), [{ player: STAR }, { player: ROCK }]),
    ),
    ...[3, 2, 1].map((d) => withLineup(loss(daysAgo(d)), [{ player: ROCK }])),
  ]);

  await page.goto("/analysis");
  await expect(
    tableRow(page, "With and without", STAR.name).getByRole("cell"),
  ).toHaveText(["3", "100%", "3", "0%", "+100 pts"]);
  await expect(
    tableRow(page, "With and without", ROCK.name).getByRole("cell"),
  ).toHaveText(["6", "50%", "0", "–", "–"]);
});

test("a Gap resting on fewer than 3 Matches with or without a Squad Member shows no value", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // Bench plays 2 Matches, both Wins; Rock plays all 6.
  await record(fakeEa, triggerPoll, [
    ...[6, 5].map((d) =>
      withLineup(win(daysAgo(d)), [{ player: BENCH }, { player: ROCK }]),
    ),
    withLineup(win(daysAgo(4)), [{ player: ROCK }]),
    ...[3, 2, 1].map((d) => withLineup(loss(daysAgo(d)), [{ player: ROCK }])),
  ]);

  await page.goto("/analysis");
  await expect(
    tableRow(page, "With and without", BENCH.name).getByRole("cell"),
  ).toHaveText(["2", "100%", "4", "25%", "–"]);
  await expect(
    region(page, "Personnel").getByText(
      "A Gap needs at least 3 Matches with and 3 without.",
    ),
  ).toBeVisible();
});

/** STAR at Forward in 3 Matches and at Midfielder in the rest, with these outcomes. */
async function recordPositions(
  fakeEa: Fake,
  triggerPoll: () => Promise<void>,
  forward: ("W" | "L")[],
  midfield: ("W" | "L")[],
) {
  const build = (o: "W" | "L", d: number, pos: string) =>
    withLineup((o === "W" ? win : loss)(daysAgo(d)), [
      { player: STAR, pos },
      { player: ROCK, pos: "goalkeeper" },
    ]);
  let day = 20;
  await record(fakeEa, triggerPoll, [
    ...forward.map((o) => build(o, day--, "forward")),
    ...midfield.map((o) => build(o, day--, "midfielder")),
  ]);
}

test("a position outlier appears when its thresholds are met", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // At Forward 67% (3 Matches), otherwise 33% (3): a 33-point gap.
  await recordPositions(fakeEa, triggerPoll, ["W", "W", "L"], ["L", "L", "W"]);

  await page.goto("/analysis");
  const outliers = page.getByRole("table", { name: "Position outliers" });
  await expect(outliers.getByRole("rowheader")).toHaveText([
    `${STAR.name} at Forward`,
    `${STAR.name} at Midfielder`,
  ]);
  await expect(
    tableRow(page, "Position outliers", `${STAR.name} at Forward`).getByRole(
      "cell",
    ),
  ).toHaveText(["3", "67%", "3", "33%", "+33 pts"]);
});

test("a position outlier does not appear under the gap", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // At Forward 67% (3 Matches), otherwise 50% (4): a 17-point gap.
  await recordPositions(
    fakeEa,
    triggerPoll,
    ["W", "W", "L"],
    ["W", "L", "W", "L"],
  );

  await page.goto("/analysis");
  await expect(region(page, "Personnel")).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Position outliers" }),
  ).toHaveCount(0);
});

test("Matches 30 minutes apart share a Session and 60 minutes apart start a new one", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const at = (day: number, minutes: number) => ({
    playedAt: new Date(Date.UTC(2026, 8, day, 19, 0) + minutes * 60_000),
  });
  await record(fakeEa, triggerPoll, [
    win(at(1, 0)), // 1st
    win(at(1, 30)), // 2nd: 30 minutes on
    loss(at(1, 90)), // 1st: 60 minutes on
    win(at(2, 0)), // 1st
    loss(at(2, 30)), // 2nd
    draw(at(2, 90)), // 1st
  ]);

  await page.goto("/analysis");
  await expect(barList(page, "Win % by place in Session")).toHaveText([
    /^1st \(4\)\s*50%$/,
    /^2nd \(2\)\s*50%$/,
  ]);
});

test("kick-off and weekday groups use London time across a BST change", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // BST ended on Sun 26 Oct 2025.
  await record(fakeEa, triggerPoll, [
    win({ playedAt: new Date("2025-10-21T19:00:00Z") }), // Tue 20:00 BST
    loss({ playedAt: new Date("2025-10-25T16:30:00Z") }), // Sat 17:30 BST
    win({ playedAt: new Date("2025-10-24T23:30:00Z") }), // Sat 00:30 BST
    win({ playedAt: new Date("2025-10-28T20:00:00Z") }), // Tue 20:00 GMT
    draw({ playedAt: new Date("2025-10-31T22:30:00Z") }), // Fri 22:30 GMT
    loss({ playedAt: new Date("2025-11-01T17:30:00Z") }), // Sat 17:30 GMT
  ]);

  await page.goto("/analysis");
  await expect(barList(page, "Win % by kick-off time")).toHaveText([
    /^Before 18:00 \(3\)\s*33%$/,
    /^20:00–22:00 \(2\)\s*100%$/,
    /^22:00 or later \(1\)\s*0%$/,
  ]);
  // The day chart came from Trends (CLUBS-59), Monday first.
  await expect(barList(page, "Win % by day of the week")).toHaveText([
    /^Tue \(2\)\s*100%$/,
    /^Fri \(1\)\s*0%$/,
    /^Sat \(3\)\s*33%$/,
  ]);
});

test("each FilterBar dimension changes the results", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const summary = () => region(page, "Top findings").locator("p").first();

  // Season 1: an old Win, 40 days ago. Season 2 starts at the second Poll,
  // so every Match played before now is in Season 1.
  await fakeEa.addMatch(win(daysAgo(40)));
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(31),
  );
  await triggerPoll();
  await fakeEa.setPayload(
    "currentSeasonLeaderboard/search",
    leaderboardWithGamesPlayed(2),
  );
  await triggerPoll();

  // 3 Wins and 3 losses in the last 10 days, then a Playoff loss and a DNF
  // loss in Season 2.
  await record(fakeEa, triggerPoll, [
    ...basicSplit(),
    loss({ matchType: "playoffMatch", playedAt: new Date() }),
    dnf({ ourWin: false, playedAt: new Date(Date.now() + 60_000) }),
  ]);

  await page.goto("/analysis");
  await expect(summary()).toContainText("4 Wins and 5 draws and defeats");

  await page.goto("/analysis?types=league");
  await expect(summary()).toContainText("4 Wins and 4 draws and defeats");

  await page.goto("/analysis?dnf=0&types=playoff");
  await expect(page.getByText("Not enough Matches yet")).toBeVisible();

  await page.goto("/analysis?dnf=0");
  await expect(summary()).toContainText("4 Wins and 4 draws and defeats");

  await page.goto("/analysis?range=30d");
  await expect(summary()).toContainText("3 Wins and 5 draws and defeats");

  await page.goto("/analysis?season=2");
  await expect(page.getByText("Not enough Matches yet")).toBeVisible();
});

test("the Position Group filter changes only the per-player section", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordPositions(fakeEa, triggerPoll, ["W", "W", "L"], ["L", "L", "W"]);

  await page.goto("/analysis");
  const outcomeSplit = region(page, "Outcome Split");
  const before = await outcomeSplit.textContent();
  const star = () =>
    tableRow(
      page,
      "Squad Members in Wins against draws and defeats",
      STAR.name,
    );
  // Find the Apps columns by header, since Swing and consistency lead the table.
  const headers = await page
    .getByRole("table", {
      name: "Squad Members in Wins against draws and defeats",
    })
    .getByRole("columnheader")
    .allTextContents();
  // The first column is the row header, so data cells start one along.
  const appsW = headers.findIndex((h) => h.trim() === "Apps W") - 1;
  const appsDp = headers.findIndex((h) => h.trim() === "Apps D/L") - 1;
  expect(appsW).toBeGreaterThanOrEqual(0);
  await expect(star().getByRole("cell").nth(appsW)).toHaveText("3");
  await expect(star().getByRole("cell").nth(appsDp)).toHaveText("3");

  const picker = region(page, "Squad Members").getByRole("group", {
    name: "Position Group",
  });
  await expect(async () => {
    await picker.getByRole("button", { name: "Forward", exact: true }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("pos"), {
        timeout: 1000,
      })
      .toBe("forward");
  }).toPass();

  await expect(star().getByRole("cell").nth(appsW)).toHaveText("2");
  await expect(star().getByRole("cell").nth(appsDp)).toHaveText("1");
  // Rock only kept goal, so drops out of the table.
  await expect(
    tableRow(
      page,
      "Squad Members in Wins against draws and defeats",
      ROCK.name,
    ),
  ).toHaveCount(0);
  // Everything else is unchanged.
  expect(await outcomeSplit.textContent()).toBe(before);
  await expect(
    tableRow(page, "With and without", ROCK.name).getByRole("cell").first(),
  ).toHaveText("6");
});

test("the trend chart shows a rolling 10-Match Win %", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 10 Wins, then 3 losses: the last point covers 7 Wins in 10.
  await record(fakeEa, triggerPoll, [
    ...Array.from({ length: 10 }, (_, i) => win(daysAgo(20 - i))),
    ...[3, 2, 1].map((d) => loss(daysAgo(d))),
  ]);

  await page.goto("/analysis");
  const trend = region(page, "Trend");
  await expect(trend.getByRole("slider")).toBeVisible();
  const cells = trend
    .getByRole("table", { name: "Rolling 10-Match Win %" })
    .getByRole("cell");
  await expect(cells).toHaveCount(13);
  await expect(cells.nth(9)).toHaveText("100%");
  await expect(cells.nth(12)).toHaveText("70%");
  // The dashed 50% reference line.
  await expect(trend.locator("svg line[stroke-dasharray]")).toHaveCount(1);
});

test("the profile panel shows Wins against Dropped Points and follows ?pos=", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await recordPositions(fakeEa, triggerPoll, ["W", "W", "L"], ["L", "L", "W"]);

  const panel = () => region(page, "Wins vs Dropped Points");
  const apps = () =>
    panel()
      .getByRole("table", { name: "Wins against Dropped Points" })
      .locator("tbody tr")
      .filter({ has: page.getByRole("rowheader", { name: "Appearances" }) })
      .getByRole("cell");
  const byPosition = () =>
    panel()
      .getByRole("table", { name: "Win % at each Position Group" })
      .getByRole("rowheader");

  await page.goto(`/players/${STAR.id}`);
  await expect(apps()).toHaveText(["3", "3"]);
  await expect(byPosition()).toHaveText(["Forward", "Midfielder"]);

  await page.goto(`/players/${STAR.id}?pos=forward`);
  await expect(apps()).toHaveText(["2", "1"]);
  await expect(byPosition()).toHaveText(["Forward"]);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Analysis fits without horizontal page scroll and the nav includes it", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await recordPositions(
      fakeEa,
      triggerPoll,
      ["W", "W", "L"],
      ["L", "L", "W"],
    );
    await fakeEa.addMatch(withLineup(win(daysAgo(1)), [{ player: BENCH }]));
    await triggerPoll();

    for (const path of [
      "/analysis",
      "/analysis?pos=forward",
      `/players/${STAR.id}`,
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits, path).toBe(true);
    }

    const nav = page.getByRole("navigation", { name: "Primary" });
    const analysis = nav.getByRole("link", { name: "Analysis" });
    await expect(analysis).toBeVisible();
    // Every nav item fits on screen without scrolling the nav.
    const box = await analysis.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(375);
  });
});

test("the nav links to Analysis", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Analysis" })
    .click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(page.locator("h1")).toHaveText("Analysis");
});

test.describe("After a result (CLUBS-26)", () => {
  /** Matches 30 minutes apart from 19:00 UTC on `day` September 2026: one Session. */
  function sessionOf(
    day: number,
    outcomes: string,
    startMinutes = 0,
  ): AddMatchBody[] {
    return [...outcomes].map((o, i) => {
      const playedAt = new Date(
        Date.UTC(2026, 8, day, 19, 0) + (startMinutes + i * 30) * 60_000,
      );
      return o === "W" ? win({ playedAt }) : loss({ playedAt });
    });
  }

  function afterResultBars(page: Page, scope: string) {
    return barList(page, `Win % after a result: ${scope}`);
  }

  /** Same Session: 1 of 5 won after Dropped Points, 3 of 5 after a Win. */
  const tiltSessions = () => [
    ...sessionOf(1, "WWWWLL"),
    ...sessionOf(2, "WLLLLW"),
  ];

  test("the Win % after a Win and after Dropped Points follow the Match order", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // W, L, W, L, L, W, W, L, W, L: a day apart, so no two share a Session.
    // After a Win: L, L, W, L, L (1 of 5). After Dropped Points: W, L, W, W (3 of 4).
    const outcomes = [..."WLWLLWWLWL"];
    await record(
      fakeEa,
      triggerPoll,
      outcomes.map((o, i) =>
        (o === "W" ? win : loss)(daysAgo(outcomes.length - i)),
      ),
    );

    await page.goto("/analysis");
    await expect(region(page, "After a result")).toBeVisible();
    await expect(afterResultBars(page, "Any next Match")).toHaveText([
      /^After a Win \(5\)\s*20%$/,
      /^After a draw or defeat \(4\)\s*75%$/,
    ]);
  });

  test("the next Match is the next one the FilterBar keeps", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // League W, L, W, L, W, L, L a day apart, with a won Playoff after each loss.
    const league = [..."WLWLWLL"];
    const builds = league.flatMap((o, i) => {
      const day = (league.length - i) * 2;
      return o === "W"
        ? [win(daysAgo(day))]
        : [
            loss(daysAgo(day)),
            win({ ...daysAgo(day - 1), matchType: "playoffMatch" }),
          ];
    });
    await record(fakeEa, triggerPoll, builds);

    // With Playoffs, each loss is followed by a won Playoff.
    await page.goto("/analysis");
    await expect(afterResultBars(page, "Any next Match")).toHaveText([
      /^After a Win \(6\)\s*33%$/,
      /^After a draw or defeat \(4\)\s*100%$/,
    ]);

    // League only skips the Playoffs: W→L three times, L→W twice and L→L.
    await page.goto("/analysis?types=league");
    await expect(afterResultBars(page, "Any next Match")).toHaveText([
      /^After a Win \(3\)\s*0%$/,
      /^After a draw or defeat \(3\)\s*67%$/,
    ]);
  });

  test("a Match 2 hours after Dropped Points counts under Any next Match but not Same Session", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await record(fakeEa, triggerPoll, [
      ...sessionOf(1, "WLWL"),
      ...sessionOf(2, "LWLW"),
      ...sessionOf(3, "WL"),
      // 2 hours after the loss before it, so a new Session.
      ...sessionOf(3, "W", 30 + 120),
    ]);

    await page.goto("/analysis");
    // Within Sessions: W→L four times, L→W three times.
    await expect(afterResultBars(page, "Same Session")).toHaveText([
      /^After a Win \(4\)\s*0%$/,
      /^After a draw or defeat \(3\)\s*100%$/,
    ]);
    // Any next Match adds the pairs across Sessions: L→L, W→W and the L→W 2 hours on.
    await expect(afterResultBars(page, "Any next Match")).toHaveText([
      /^After a Win \(5\)\s*20%$/,
      /^After a draw or defeat \(5\)\s*80%$/,
    ]);
  });

  test("fewer than 3 Matches on either side hides the split and keeps it out of the findings", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // W, W, W, L, L, L a day apart: 3 Matches after a Win, 2 after Dropped Points.
    await record(fakeEa, triggerPoll, basicSplit());

    await page.goto("/analysis");
    const section = region(page, "After a result");
    await expect(section).toBeVisible();
    await expect(afterResultBars(page, "Any next Match")).toHaveCount(0);
    await expect(afterResultBars(page, "Same Session")).toHaveCount(0);
    await expect(
      section.getByText(
        "Needs at least 3 Matches after a Win and 3 after a draw or defeat (3 and 2 so far).",
      ),
    ).toBeVisible();
    await expect(
      section.getByText(
        "Needs at least 3 Matches after a Win and 3 after a draw or defeat (0 and 0 so far).",
      ),
    ).toBeVisible();
    await expect(
      findings(page).filter({ hasText: "After a draw or defeat" }),
    ).toHaveCount(0);
  });

  test("a strong tilt effect within a Session is a top finding in plain English", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await record(fakeEa, triggerPoll, tiltSessions());

    await page.goto("/analysis");
    const tilt = findings(page).filter({
      hasText:
        "After a draw or defeat in the same Session we win 20% (5 Matches) vs 60% after a Win (5)",
    });
    await expect(tilt).toHaveCount(1);
    await expect(tilt).toContainText("After a result");
    await expect(tilt).toContainText(
      "5 Matches after a draw or defeat, 5 after a Win in the same Session",
    );
    await expect(tilt).toContainText("Small sample");
  });

  test.describe("on a 375px phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("After a result fits without horizontal page scroll", async ({
      page,
      fakeEa,
      triggerPoll,
    }) => {
      await record(fakeEa, triggerPoll, tiltSessions());

      await page.goto("/analysis");
      await expect(afterResultBars(page, "Same Session")).toHaveCount(2);
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(fits).toBe(true);
    });
  });
});

test("EA's Season snapshot sits on Analysis, unchanged by the filters", async ({
  page,
  triggerPoll,
}) => {
  await triggerPoll();
  for (const path of ["/analysis", "/analysis?range=7d"]) {
    await page.goto(path);
    const snapshot = page.getByRole("region", { name: "Season snapshot" });
    await expect(snapshot).toContainText("1632");
    await expect(snapshot).toContainText("55-18-39");
  }

  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Season snapshot" }),
  ).toHaveCount(0);
});
