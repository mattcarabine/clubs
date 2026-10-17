// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import type { EaPlayerStats } from "../app/ea/types.ts";
import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  friendly,
  type MatchOptions,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { daysAgo, record } from "./support/record.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-37: the profile's "Recent changes", a Squad Member's last 10
// Appearances against every one before, and the Squad table's "Recent" column.

/** A Squad Member that exists only in these specs. */
const FINDER = { id: "900000041", name: "Form Finder" };

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds, so every count is exact.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

type Spell = {
  count: number;
  stats?: (i: number) => EaPlayerStats;
  pos?: string;
  build?: (options: MatchOptions) => AddMatchBody;
};

/** One Match per Appearance, a day apart, oldest spell first. */
function appearances(...spells: Spell[]): AddMatchBody[] {
  const total = spells.reduce((sum, s) => sum + s.count, 0);
  let day = total;
  return spells.flatMap(({ count, stats, pos, build = win }) =>
    Array.from({ length: count }, (_, i) =>
      withLineup(build(daysAgo(day--)), [
        { player: FINDER, pos, stats: stats?.(i) },
      ]),
    ),
  );
}

/** Pass % with passes made held level, so passes per 90 do not change. */
function passing(attempts: number): () => EaPlayerStats {
  return () => ({ passesmade: "63", passattempts: String(attempts) });
}

function section(page: Page) {
  return page.getByRole("region", { name: "Recent changes" });
}

function changes(page: Page, list: "Improving" | "Dropping off") {
  return section(page).getByRole("list", { name: list }).getByRole("listitem");
}

const profile = `/players/${FINDER.id}`;

test("a clear rise in pass % shows under Improving with both values and counts", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 10, stats: passing(90) }, // 70%
      { count: 10, stats: passing(70) }, // 90%
    ),
  );

  await page.goto(profile);
  const [pass] = await changes(page, "Improving").all();
  await expect(changes(page, "Improving")).toHaveCount(1);
  await expect(pass).toContainText("Pass %");
  await expect(pass).toContainText(
    "Form Finder's pass % is up 20 points over the last 10 Appearances (90% vs 70%)",
  );
  await expect(pass).toContainText("10 recent Appearances, 10 before");
  await expect(pass).not.toContainText("Small sample");
  await expect(pass.getByRole("img", { name: /^Pass %/ })).toBeVisible();
  await expect(
    section(page).getByRole("list", { name: "Dropping off" }),
  ).toHaveCount(0);
});

test("a clear drop in shots per 90 shows under Dropping off", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 8, stats: () => ({ shots: "5" }) },
      { count: 10, stats: () => ({ shots: "1" }) },
    ),
  );

  await page.goto(profile);
  const shots = changes(page, "Dropping off").filter({
    hasText: "Shots per 90",
  });
  await expect(shots).toContainText("Form Finder's shots per 90 are down");
  await expect(shots).toContainText("10 recent Appearances, 8 before");
  await expect(shots).toContainText("Small sample");
});

test("with fewer than 5 Appearances before the last 10 the section shows the EmptyState", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 4, stats: passing(90) },
      { count: 10, stats: passing(70) },
    ),
  );

  await page.goto(profile);
  await expect(section(page)).toContainText("Not enough Appearances yet");
  await expect(section(page)).toContainText(
    "Form Finder has 14 in these filters",
  );
  await expect(section(page).getByRole("listitem")).toHaveCount(0);
});

test("changes under the effect-size threshold are not shown", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  // 70% and 90% alternating, then 72% and 92%: a 2-point rise on a 10-point spread.
  const alternating = (low: number) => (i: number) => ({
    passesmade: String(i % 2 ? low + 10 : low),
    passattempts: "50",
  });
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 10, stats: alternating(35) },
      { count: 10, stats: alternating(36) },
    ),
  );

  await page.goto(profile);
  await expect(section(page)).toContainText("No clear changes");
  await expect(section(page)).toContainText(
    "Form Finder's last 10 Appearances are in line with the 10 before them.",
  );
  await expect(section(page).getByRole("listitem")).toHaveCount(0);
});

test("the Position Group and Match Type filters change the result", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 10, stats: passing(90), pos: "midfielder" },
      // Recent: Friendlies as Forward.
      { count: 10, stats: passing(70), pos: "forward", build: friendly },
    ),
  );

  // Competitive only by default: just the 10 Midfielder Appearances.
  await page.goto(profile);
  await expect(section(page)).toContainText("Not enough Appearances yet");

  await page.goto(`${profile}?types=league,playoff,friendly`);
  await expect(
    changes(page, "Improving").filter({ hasText: "Pass %" }),
  ).toHaveCount(1);

  await page.goto(`${profile}?types=league,playoff,friendly&pos=forward`);
  await expect(section(page)).toContainText("Not enough Appearances yet");
  await expect(section(page)).toContainText(
    "Form Finder has 10 in these filters",
  );
});

test("the Squad table shows each Squad Member's biggest recent change", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 10, stats: passing(90) },
      { count: 10, stats: passing(70) },
    ),
  );

  await page.goto("/squad");
  const row = page
    .getByRole("table", { name: "Squad Members" })
    .locator("tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: /Form Finder/ }) });
  const cell = row.locator("[title]", { hasText: "Pass %" });
  await expect(cell).toHaveAttribute(
    "title",
    "Form Finder's pass % is up 20 points over the last 10 Appearances (90% vs 70%)",
  );
  await expect(cell).toContainText("Improving:");
});

test("Recent changes fit a 375px phone without sideways scrolling", async ({
  page,
  fakeEa,
  triggerPoll,
}) => {
  await record(
    fakeEa,
    triggerPoll,
    appearances(
      { count: 10, stats: () => ({ ...passing(90)(), shots: "5" }) },
      { count: 10, stats: () => ({ ...passing(70)(), shots: "1" }) },
    ),
  );
  await page.setViewportSize({ width: 375, height: 800 });

  await page.goto(profile);
  await expect(changes(page, "Improving")).toHaveCount(1);
  await expect(changes(page, "Dropping off")).not.toHaveCount(0);
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fits).toBe(true);
});
