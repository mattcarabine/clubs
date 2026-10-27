// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Locator, Page } from "@playwright/test";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  dnf,
  draw,
  loss,
  OUR_CLUB_ID,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { matchList } from "./support/match-list.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-31: the hero ScoreBar (the home page and the Match page) and the Top
// performers strip.

const CLUB_NAME = "A Bloo Bloo";
/** The tokens behind each outcome rule (app/app.css). */
const WIN = "rgb(122, 201, 67)";
const DRAW = "rgb(143, 161, 176)";
const LOSS = "rgb(239, 91, 91)";
/** CLUBS-22's moment format, e.g. "Sat 17 Oct, 22:49" (a year only outside this one). */
const MOMENT =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}( \d{4})?, \d{2}:\d{2}$/;

function opponentId(body: AddMatchBody): string {
  const id = Object.keys(body.match.clubs).find((c) => c !== OUR_CLUB_ID);
  if (!id) throw new Error("Built Match has no Opponent");
  return id;
}

/** Renames the built Match's Opponent. */
function against(body: AddMatchBody, name: string): AddMatchBody {
  const club = body.match.clubs[opponentId(body)];
  club.details = { ...club.details, name };
  return body;
}

function hero(page: Page): Locator {
  return page.getByRole("region", { name: "Score" });
}

/** A side's panel in the hero, found by the full name in its title. */
function panel(scope: Locator, name: string): Locator {
  return scope.locator(`[title="${name}"]`);
}

async function backgroundOf(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test("the hero shows the result in words over an outcome-coloured rule", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const cases = [
    { body: win({ matchId: "31001" }), word: "Win", colour: WIN },
    { body: draw({ matchId: "31002" }), word: "Draw", colour: DRAW },
    { body: loss({ matchId: "31003" }), word: "Loss", colour: LOSS },
    // A rage quit keeps the plain result; the tab cluster says who quit.
    { body: dnf({ matchId: "31004" }), word: "Win", colour: WIN },
    {
      body: dnf({ matchId: "31005", ourWin: false }),
      word: "Loss",
      colour: LOSS,
    },
  ];
  for (const { body } of cases) await fakeEa.addMatch(body);
  await triggerPoll();

  for (const { body, word, colour } of cases) {
    await page.goto(`/matches/${body.match.matchId}`);
    const score = hero(page);
    await expect(score.getByText(word, { exact: true })).toBeVisible();
    expect(await backgroundOf(score.getByTestId("outcome-rule"))).toBe(colour);
    // The result sits with the score, not in a corner W/D/L block.
    await expect(score.getByRole("img")).toHaveCount(0);
  }
});

test("one tab cluster holds the Match Type, status and kick-off", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(loss({ matchId: "31010", matchType: "playoffMatch" }));
  await fakeEa.addMatch(dnf({ matchId: "31011" }));
  await triggerPoll();

  await page.goto("/matches/31010");
  await expect(
    hero(page)
      .getByRole("list", { name: "Match details" })
      .getByRole("listitem"),
  ).toHaveText(["Playoff", "Full time", MOMENT]);

  await page.goto("/matches/31011");
  await expect(
    hero(page)
      .getByRole("list", { name: "Match details" })
      .getByRole("listitem"),
  ).toHaveText(["League", "They rage quit", MOMENT]);

  // The home page's lead Match (the rage quit, played last) uses the same cluster.
  await page.goto("/");
  await expect(
    page
      .getByRole("region", { name: "Latest Match" })
      .getByRole("list", { name: "Match details" })
      .getByRole("listitem"),
  ).toHaveText(["League", "They rage quit", MOMENT]);
});

test("the stat strip compares both clubs' shots, pass % and tackles", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const body = win({ matchId: "31020" });
  await fakeEa.addMatch(body);
  await triggerPoll();

  const totals = (clubId: string) => {
    const players = Object.values(body.match.players[clubId]);
    const sum = (
      field: "shots" | "passesmade" | "passattempts" | "tacklesmade",
    ) => players.reduce((total, p) => total + Number(p[field]), 0);
    return [
      String(sum("shots")),
      `${Math.round((sum("passesmade") / sum("passattempts")) * 100)}%`,
      String(sum("tacklesmade")),
    ];
  };
  const ours = totals(OUR_CLUB_ID);
  const theirs = totals(opponentId(body));
  const opponent = body.match.clubs[opponentId(body)].details?.name;

  for (const path of ["/matches/31020", "/"]) {
    await page.goto(path);
    const strip = page.getByRole("region", { name: "Key stats" });
    await expect(strip.getByRole("term")).toHaveText([
      "Shots",
      "Pass %",
      "Tackles",
    ]);
    await expect(strip.getByRole("definition")).toHaveText(
      ours.flatMap((value, i) => [
        `${CLUB_NAME} ${value}`,
        `${opponent} ${theirs[i]}`,
      ]),
    );
  }
});

test("the stat strip is hidden when EA sent no Opponent Appearances", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const body = win({ matchId: "31021" });
  delete body.match.players[opponentId(body)];
  await fakeEa.addMatch(body);
  await triggerPoll();

  await page.goto("/matches/31021");
  await expect(hero(page).getByText(`${CLUB_NAME} 3,`)).toBeAttached();
  await expect(page.getByRole("region", { name: "Key stats" })).toHaveCount(0);
});

test("our panel carries the crest, the Opponent's its monogram", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(against(loss({ matchId: "31030" }), "Kebab Over6pack"));
  await triggerPoll();

  await page.goto("/matches/31030");
  const score = hero(page);
  await expect(
    panel(score, CLUB_NAME).locator('img[src*="crest"]'),
  ).toBeVisible();
  await expect(
    panel(score, "Kebab Over6pack").getByTestId("club-monogram"),
  ).toHaveText("KO");
});

test("one top performer gets a short, still strip centred under the hero, with no slash markers", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(
    withLineup(win({ matchId: "31040" }), [
      { player: { id: "9001", name: "Solo Scorer" }, goals: 3, rating: 8.7 },
    ]),
  );
  await triggerPoll();
  // Wide enough that the one chip fits with room to spare.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  const latest = page.getByRole("region", { name: "Latest Match" });
  const strip = latest.getByRole("region", { name: "Top performers" });
  await expect(strip.getByText("Solo Scorer")).toBeVisible();
  await expect(strip.getByText("rated 8.7")).toBeVisible();
  await expect(strip.locator(".animate-ticker")).toHaveCount(0);

  const markers = await strip
    .locator("li")
    .evaluateAll((items) =>
      items.map((li) => getComputedStyle(li, "::before").content),
    );
  expect(markers.every((content) => content === "none")).toBe(true);

  const stripBox = await strip.boundingBox();
  const heroBox = await latest.boundingBox();
  if (!stripBox || !heroBox) throw new Error("Strip or hero not laid out");
  expect(stripBox.width).toBeLessThan(heroBox.width / 2);
  const centre = (box: { x: number; width: number }) => box.x + box.width / 2;
  expect(Math.abs(centre(stripBox) - centre(heroBox))).toBeLessThan(2);
});

test("at 375px long names truncate, the stat strip stacks and nothing scrolls sideways", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  const longName = "Real Gravesend Rovers Football Club";
  await fakeEa.addMatch(against(win({ matchId: "31050" }), longName));
  await triggerPoll();
  await page.setViewportSize({ width: 375, height: 800 });

  for (const path of ["/matches/31050", "/"]) {
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);

    const name = panel(page.getByRole("main"), longName)
      .getByText(longName, { exact: true })
      .first();
    await expect(name).toBeVisible();
    // Clamped: its full text is taller than the two lines it shows.
    expect(await name.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
      true,
    );

    // Three figures side by side, each label above its two values.
    const strip = page.getByRole("region", { name: "Key stats" });
    const terms = await strip
      .getByRole("term")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(new Set(terms.map(Math.round)).size).toBe(1);
    const [term, figure] = await Promise.all([
      strip.getByRole("term").first().boundingBox(),
      strip.getByRole("definition").first().boundingBox(),
    ]);
    expect(figure?.y ?? 0).toBeGreaterThanOrEqual(
      (term?.y ?? 0) + (term?.height ?? 0),
    );

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("on wide screens the hero is capped and centred, and each club fills at least 70% of its panel", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(
    against(
      loss({ matchId: "31060", goalsFor: 3, goalsAgainst: 7 }),
      "Kebab Over6pack",
    ),
  );
  await triggerPoll();

  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/matches/31060");
    await page.evaluate(() => document.fonts.ready);

    const score = hero(page);
    const main = await page.getByRole("main").boundingBox();
    const bar = await panel(score, CLUB_NAME).locator("..").boundingBox();
    if (!main || !bar) throw new Error("Hero not laid out");
    expect(bar.width).toBeLessThanOrEqual(960);
    expect(
      Math.abs(bar.x + bar.width / 2 - (main.x + main.width / 2)),
    ).toBeLessThan(2);

    for (const name of [CLUB_NAME, "Kebab Over6pack"]) {
      const offset = await panel(score, name).evaluate((el) => {
        const box = el.getBoundingClientRect();
        const children = Array.from(el.children).map((c) =>
          c.getBoundingClientRect(),
        );
        const left = Math.min(...children.map((c) => c.left));
        const right = Math.max(...children.map((c) => c.right));
        return {
          offset: Math.abs((left + right) / 2 - (box.left + box.width / 2)),
          filled: (right - left) / box.width,
        };
      });
      expect(offset.offset, `${name} centred at ${width}px`).toBeLessThan(4);
      expect(
        offset.filled,
        `${name} fills its panel at ${width}px`,
      ).toBeGreaterThan(0.7);
    }
  }
});

test("compact rows keep the W/D/L block beside the score", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
  await fakeEa.addMatch(
    against(win({ matchId: "31070" }), "Northside Athletic"),
  );
  await triggerPoll();
  await page.goto("/");

  const row = matchList(page)
    .getByRole("link", { name: /Northside Athletic/ })
    .first();
  const badge = await row.getByRole("img", { name: "Win" }).boundingBox();
  const ours = await panel(row, CLUB_NAME).boundingBox();
  const theirs = await panel(row, "Northside Athletic").boundingBox();
  if (!badge || !ours || !theirs) throw new Error("Row not laid out");
  // Between the two club panels, in the score block.
  expect(badge.x).toBeGreaterThan(ours.x + ours.width - 16);
  expect(badge.x + badge.width).toBeLessThan(theirs.x + 16);
  expect(badge.y).toBeGreaterThanOrEqual(ours.y);
});
