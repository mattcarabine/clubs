// page.evaluate callbacks run in the browser, so they need DOM types.
/// <reference lib="dom" />
import type { Page } from "@playwright/test";

import { win } from "./support/match-builders.ts";
import { membersPayload } from "./support/members.ts";
import { expect, test } from "./support/test.ts";

// CLUBS-19: EA's own season and career totals on the profile and the Squad table.

/** Kabeeble: in every recorded Match; 112 games and 74% pass success in both member fixtures. */
const KABEEBLE = "256171605";

/** The recorded line-up of `win()`, as EA names them. */
const LINEUP = ["Kabeeble", "Loltown95", "tinbs_irl", "JONTEeu"];

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  for (const variant of ["leagueMatch", "playoffMatch", "friendlyMatch"]) {
    await fakeEa.setPayload("clubs/matches", [], variant);
  }
});

function region(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

function filters(page: Page) {
  return region(page, "Stats filters");
}

function squadTable(page: Page) {
  return page.getByRole("table", { name: "Squad Members" });
}

/** Squad Member names in table order. */
function tableNames(page: Page) {
  return squadTable(page).locator("tbody").getByRole("rowheader");
}

test.describe("player profile", () => {
  test("the EA totals block shows EA's season and career figures, labelled as EA data", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.addMatch(win());
    await triggerPoll();

    await page.goto(`/players/${KABEEBLE}`);
    const block = region(page, "EA totals");
    await expect(
      block.getByText(
        "EA's own numbers, including Matches from before tracking began",
      ),
    ).toBeVisible();

    const season = region(page, "This Season (EA)");
    const figure = (label: string) =>
      season
        .getByRole("term")
        .getByText(label, { exact: true })
        .locator("xpath=following-sibling::dd[1]");
    await expect(figure("Games")).toHaveText("112");
    await expect(figure("Pass success")).toHaveText("74%");
    await expect(figure("Passes")).toHaveText("1,267");
    await expect(figure("Shot success")).toHaveText("31%");
    await expect(figure("Win rate")).toHaveText("49%");
    // A midfielder's clean sheets count as a Defender's.
    await expect(figure("Clean sheets (DEF)")).toHaveText("0");

    await expect(
      region(page, "Career (EA)")
        .getByRole("definition")
        .filter({ hasText: /^112$/ }),
    ).toBeVisible();
    await expect(block.getByText("1 Appearance")).toBeVisible();
  });

  test("before any Snapshot the EA totals block says when they arrive", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.setPayload("members/stats", { members: [] });
    await fakeEa.setPayload("members/career/stats", { members: [] });
    await fakeEa.addMatch(win());
    await triggerPoll();

    await page.goto(`/players/${KABEEBLE}`);
    const block = region(page, "EA totals");
    await expect(block.getByText("No EA totals yet")).toBeVisible();
    await expect(
      block.getByText(/arrive with the next Poll that reaches EA/),
    ).toBeVisible();
  });
});

test.describe("Squad table", () => {
  test("in EA totals mode, sorting by goals ranks by EA season goals and the Match filters are hidden", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    // EA's season goals put tinbs_irl top, whatever the one recorded Match says.
    await fakeEa.setPayload(
      "members/stats",
      membersPayload("members/stats", {
        tinbs_irl: { goals: "140" },
        JONTEeu: { goals: "99" },
      }),
    );
    await fakeEa.addMatch(win());
    await triggerPoll();

    await page.goto("/squad?source=ea");
    await expect(
      filters(page).getByRole("group", { name: "Source" }),
    ).toBeVisible();
    for (const control of [
      "Match Type",
      "Dates",
      "DNF",
      "Minimum Appearances",
    ]) {
      await expect(
        filters(page).getByRole("group", { name: control }),
      ).toHaveCount(0);
    }
    await expect(
      filters(page).getByText("The Match filters don't apply to them."),
    ).toBeVisible();

    const headers = squadTable(page).getByRole("columnheader");
    await expect(headers.filter({ hasText: /\/90/ })).toHaveCount(0);
    await expect(headers.filter({ hasText: /^Form$/ })).toHaveCount(0);
    await expect(headers.filter({ hasText: /^Pass %/ })).toHaveCount(1);

    await squadTable(page)
      .getByRole("button", { name: "G", exact: true })
      .click();
    // IGrav97 has EA totals but no Appearance, so is not a known Squad Member.
    await expect(tableNames(page)).toHaveText([
      /tinbs_irl/,
      /JONTEeu/,
      /Kabeeble/,
      /Loltown95/,
    ]);
  });

  test("the source toggle lives in the URL", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.addMatch(win());
    await fakeEa.addMatch(win());
    await fakeEa.addMatch(win());
    await triggerPoll();

    await page.goto("/squad?types=league");
    const source = filters(page).getByRole("group", { name: "Source" });
    await expect(
      source.getByRole("button", { name: "Recorded" }),
    ).toHaveAttribute("aria-pressed", "true");

    await source.getByRole("button", { name: "EA totals" }).click();
    await expect(page).toHaveURL(/[?&]source=ea(&|$)/);
    // The filter stays in the URL for the way back.
    await expect(page).toHaveURL(/types=league/);
    await expect(
      page.getByText(/^EA's season totals for 4 Squad Members/),
    ).toBeVisible();
    await expect(tableNames(page)).toHaveCount(LINEUP.length);

    // A reload keeps EA totals.
    await page.reload();
    await expect(
      source.getByRole("button", { name: "EA totals" }),
    ).toHaveAttribute("aria-pressed", "true");

    await source.getByRole("button", { name: "Recorded" }).click();
    await expect(page).not.toHaveURL(/source=/);
    await expect(
      filters(page).getByRole("group", { name: "Match Type" }),
    ).toBeVisible();
    await expect(
      squadTable(page).getByRole("columnheader").filter({ hasText: /^Form/ }),
    ).toHaveCount(1);
  });

  test("EA totals mode shows the name and rate stats on a 375px phone without page scroll", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.addMatch(win());
    await triggerPoll();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/squad?source=ea");
    await expect(tableNames(page)).toHaveCount(LINEUP.length);

    const pageFits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(pageFits).toBe(true);

    // Before any sideways scroll, the name and the key rates are on screen.
    for (const header of ["Squad Member", "Rating", "Pass %"]) {
      const cell = squadTable(page)
        .getByRole("columnheader")
        .filter({ hasText: new RegExp(`^${header}`) });
      const right = await cell.evaluate(
        (el) => el.getBoundingClientRect().right,
      );
      expect(right, header).toBeLessThanOrEqual(375);
    }
  });

  test("before any Snapshot, EA totals mode says when they arrive", async ({
    page,
    fakeEa,
    triggerPoll,
  }) => {
    await fakeEa.setPayload("members/stats", { members: [] });
    await fakeEa.setPayload("members/career/stats", { members: [] });
    await fakeEa.addMatch(win());
    await triggerPoll();

    await page.goto("/squad?source=ea");
    await expect(page.getByText("No EA totals yet")).toBeVisible();
  });
});
