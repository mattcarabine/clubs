import { describe, expect, it } from "vitest";

import type { MatchType, Outcome } from "~/lib/domain";

import {
  CAMPAIGN_RULES,
  type CampaignMatchInput,
  type CampaignRuleSet,
  campaignKickoffs,
  campaignRecord,
  chancesLeft,
  divisionMismatch,
  divisionTimeline,
  findCampaign,
  replayCampaigns,
} from "./campaigns";
import { DIVISIONS, type DivisionNumber } from "./divisions";

const SEASON_START = new Date("2026-11-01T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

/** Matches an hour apart after `start`, from a run like "WWD" (P = Playoff). */
function run(results: string, start = SEASON_START): CampaignMatchInput[] {
  return [...results].map((r, i) => {
    const matchType: MatchType = r === "P" ? "Playoff" : "League";
    const outcome = (r === "P" ? "W" : r) as Outcome;
    return {
      matchId: `m${start.getTime()}-${i}`,
      matchType,
      outcome,
      playedAt: new Date(start.getTime() + (i + 1) * HOUR_MS),
    };
  });
}

/** Replays a run from one Season start. */
function replay(results: string, rules?: CampaignRuleSet) {
  return replayCampaigns(run(results), [SEASON_START], rules);
}

/** Rules where the Season starts in another Division, on some points. */
function startingIn(division: DivisionNumber, points = 0): CampaignRuleSet {
  return {
    ...CAMPAIGN_RULES,
    league: { ...CAMPAIGN_RULES.league, seasonStart: { division, points } },
  };
}

const summary = (results: string, rules?: CampaignRuleSet) =>
  replay(results, rules).campaigns.map((c) => ({
    division: c.division,
    startPoints: c.startPoints,
    points: c.points,
    stage: c.stage,
    outcome: c.outcome,
  }));

describe("replayCampaigns", () => {
  it("replays nothing before the first Season start", () => {
    const early = run("WWW", new Date(SEASON_START.getTime() - 10 * HOUR_MS));
    expect(replayCampaigns(early, []).campaigns).toEqual([]);
    expect(
      replayCampaigns(early, [SEASON_START]).campaigns[0].leagueMatches,
    ).toEqual([]);
  });

  it("starts each Season in Division 5 on 0 points with 3 Chances", () => {
    const [campaign] = replay("").campaigns;
    expect(campaign).toMatchObject({
      division: 6,
      points: 0,
      startChances: 3,
      chancesUsed: null,
      stage: "league",
      outcome: "in-progress",
      startedAt: SEASON_START,
      endedAt: null,
    });
  });

  it("Division 5: W, W, D reaches 7 points and a Promotion Series", () => {
    const [campaign] = replay("WWD").campaigns;
    expect(campaign.pointsPath).toEqual([0, 3, 6, 7]);
    expect(campaign.stage).toBe("promotion-series");
    expect(campaign.outcome).toBe("in-progress");
  });

  it("Division 5: a Win in the series promotes to Division 4 on 0 points", () => {
    const { campaigns } = replay("WWDW");
    expect(summary("WWDW")).toEqual([
      {
        division: 6,
        startPoints: 0,
        points: 7,
        stage: "promotion-series",
        outcome: "promoted",
      },
      {
        division: 5,
        startPoints: 0,
        points: 0,
        stage: "league",
        outcome: "in-progress",
      },
    ]);
    expect(campaigns[0].promotionSeries.map((m) => m.outcome)).toEqual(["W"]);
    expect(campaigns[0].endedAt).toEqual(campaigns[1].startedAt);
    expect(campaigns[1].chancesUsed).toBe(0);
  });

  it("Division 5: losses cost no Chances and never lead to a Relegation Match", () => {
    const [campaign] = replay("LLLLL").campaigns;
    expect(campaign.chancesUsed).toBeNull();
    expect(chancesLeft(campaign)).toBeNull();
    expect(campaign.stage).toBe("league");
  });

  it("Division 4: 3 league losses lead to a Relegation Match", () => {
    const [campaign] = replay("LDLL", startingIn(5)).campaigns;
    expect(campaign.chancesUsed).toBe(3);
    expect(chancesLeft(campaign)).toBe(0);
    expect(campaign.stage).toBe("relegation-match");
    expect(campaign.points).toBe(1);
  });

  it("Division 4: losing the Relegation Match relegates to Division 5 on 0 points", () => {
    const { campaigns } = replay("WLLLL", startingIn(5));
    expect(summary("WLLLL", startingIn(5))).toEqual([
      {
        division: 5,
        startPoints: 0,
        points: 3,
        stage: "relegation-match",
        outcome: "relegated",
      },
      {
        division: 6,
        startPoints: 0,
        points: 0,
        stage: "league",
        outcome: "in-progress",
      },
    ]);
    expect(campaigns[0].relegationMatch?.outcome).toBe("L");
  });

  it("Division 4: winning the Relegation Match resets the Chances and keeps the points", () => {
    const { campaigns } = replay("WLLLW", startingIn(5));
    expect(campaigns.map((c) => c.outcome)).toEqual([
      "survived-relegation-match",
      "in-progress",
    ]);
    expect(campaigns[1]).toMatchObject({
      division: 5,
      startPoints: 3,
      startChances: 3,
      chancesUsed: 0,
    });
  });

  it("drawing the Relegation Match leaves 1 Chance", () => {
    const { campaigns } = replay("LLLDL", startingIn(5));
    expect(campaigns.map((c) => c.outcome)).toEqual([
      "survived-relegation-match",
      "in-progress",
    ]);
    expect(campaigns[1].startChances).toBe(1);
    // One more loss uses it up.
    expect(campaigns[1].stage).toBe("relegation-match");
  });

  it("a failed Division 4 series restarts at 7 points", () => {
    // 10 points (W W W D), then L L fails a 2-Wins-of-3 series.
    const { campaigns } = replay("WWWDLL", startingIn(5));
    expect(campaigns.map((c) => c.outcome)).toEqual([
      "series-failed",
      "in-progress",
    ]);
    expect(campaigns[0].promotionSeries.map((m) => m.outcome)).toEqual([
      "L",
      "L",
    ]);
    expect(campaigns[1]).toMatchObject({ division: 5, points: 7 });
    // One league Win puts Our Club back in a Promotion Series.
    const again = replay("WWWDLLW", startingIn(5)).campaigns[1];
    expect(again.stage).toBe("promotion-series");
  });

  it("Division 4: W-D-W in the series still promotes", () => {
    const { campaigns } = replay("WWWDWDW", startingIn(5));
    expect(campaigns[0].outcome).toBe("promoted");
    expect(campaigns[1].division).toBe(4);
  });

  it("Division 2: a draw in the series ends it as failed", () => {
    // 17 points from 5 Wins and 2 draws, then W W D.
    const { campaigns } = replay("WWWWWDDWWD", startingIn(3));
    expect(campaigns[0].stage).toBe("promotion-series");
    expect(campaigns[0].outcome).toBe("series-failed");
    expect(campaigns[1]).toMatchObject({ division: 3, points: 14 });
  });

  it("Division 2: 4 Wins in a row promote to Division 1", () => {
    const { campaigns } = replay("WWWWWDDWWWW", startingIn(3));
    expect(campaigns[0].outcome).toBe("promoted");
    expect(campaigns[1].division).toBe(2);
  });

  it("Elite has no Points Target, however many points", () => {
    const [campaign] = replay("WWWWWWWWWWWW", startingIn(1)).campaigns;
    expect(campaign.points).toBe(36);
    expect(campaign.stage).toBe("league");
  });

  it("ignores Playoff Matches and the League Matches after them", () => {
    const { campaigns, inPlayoffs } = replay("WPWW");
    expect(inPlayoffs).toBe(true);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].leagueMatches).toHaveLength(1);
    expect(campaigns[0].points).toBe(3);
  });

  it("a new Season ends the Campaign and resets to Division 5, out of the Playoffs", () => {
    const next = new Date(SEASON_START.getTime() + 100 * HOUR_MS);
    const { campaigns, inPlayoffs } = replayCampaigns(
      [...run("WWDWWP"), ...run("W", next)],
      [SEASON_START, next],
    );
    expect(inPlayoffs).toBe(false);
    expect(campaigns.map((c) => [c.division, c.outcome])).toEqual([
      [6, "promoted"],
      [5, "season-ended"],
      [6, "in-progress"],
    ]);
    expect(campaigns[1].endedAt).toEqual(next);
    expect(campaigns[2].points).toBe(3);
  });

  it("opens a fresh Campaign for a Season start after the last Match", () => {
    const next = new Date(SEASON_START.getTime() + 100 * HOUR_MS);
    const { campaigns } = replayCampaigns(run("W"), [next, SEASON_START]);
    expect(campaigns.map((c) => c.outcome)).toEqual([
      "season-ended",
      "in-progress",
    ]);
  });

  it("replays in kick-off order whatever the input order", () => {
    const shuffled = run("WWDW").reverse();
    expect(replayCampaigns(shuffled, [SEASON_START]).campaigns[0].outcome).toBe(
      "promoted",
    );
  });

  it("reads every number from the rules table", () => {
    const rules: CampaignRuleSet = {
      divisions: {
        ...DIVISIONS,
        6: {
          ...DIVISIONS[6],
          pointsTarget: 2,
          promotionSeries: { matches: 2, winsNeeded: 2 },
          pointsAfterFailedSeries: 1,
        },
      },
      league: {
        ...CAMPAIGN_RULES.league,
        points: { W: 2, D: 1, L: 0 },
        pointsAfterPromotion: 5,
      },
    };
    // One Win (2 points) reaches the target; W then D fails the series.
    const failed = replay("WWD", rules).campaigns;
    expect(failed[0].pointsPath).toEqual([0, 2]);
    expect(failed[1].points).toBe(1);
    const promoted = replay("WWW", rules).campaigns;
    expect(promoted[1]).toMatchObject({ division: 5, points: 5 });
  });
});

describe("campaignRecord", () => {
  it("counts League Matches only, not the series", () => {
    const [campaign] = replay("WWDW").campaigns;
    expect(campaignRecord(campaign)).toEqual({ wins: 2, draws: 1, losses: 0 });
  });
});

describe("divisionTimeline", () => {
  it("has the Season start, then each Promotion and Relegation", () => {
    const { campaigns } = replay("WWDWLLLL");
    expect(
      divisionTimeline(campaigns).map((s) => [s.division, s.event]),
    ).toEqual([
      [6, "season-start"],
      [5, "promotion"],
      [6, "relegation"],
    ]);
  });

  it("skips failed series and survived Relegation Matches", () => {
    const { campaigns } = replay("WWWDLL", startingIn(5));
    expect(divisionTimeline(campaigns)).toHaveLength(1);
  });
});

describe("divisionMismatch", () => {
  it("flags EA's Division when it differs from the tracked one", () => {
    expect(divisionMismatch(replay("W"), 3)).toEqual({ tracked: 6, ea: 3 });
    expect(divisionMismatch(replay("W"), 6)).toBeNull();
  });

  it("ignores changes during the Playoffs", () => {
    expect(divisionMismatch(replay("WP"), 3)).toBeNull();
  });

  it("has nothing to check before tracking or without EA's Division", () => {
    expect(
      divisionMismatch({ campaigns: [], inPlayoffs: false }, 3),
    ).toBeNull();
    expect(divisionMismatch(replay("W"), null)).toBeNull();
  });
});

describe("findCampaign", () => {
  // Division 5 promoted after W W D W, then Division 4 in progress.
  const { campaigns } = replay("WWDWW");

  it("finds the current Campaign, the one before it, or one by number", () => {
    expect(findCampaign(campaigns, "current")).toEqual({
      number: 2,
      campaign: campaigns[1],
    });
    expect(findCampaign(campaigns, "previous")).toEqual({
      number: 1,
      campaign: campaigns[0],
    });
    expect(findCampaign(campaigns, 1)?.campaign).toBe(campaigns[0]);
  });

  it("finds nothing for an unknown Campaign", () => {
    expect(findCampaign(campaigns, 3)).toBeUndefined();
    expect(findCampaign([], "current")).toBeUndefined();
    expect(findCampaign(campaigns.slice(0, 1), "previous")).toBeUndefined();
  });
});

describe("campaignKickoffs", () => {
  it("spans the first League Match to the last Match, series included", () => {
    const matches = run("WWDLW");
    const [promoted, next] = replayCampaigns(matches, [SEASON_START]).campaigns;
    // W W D reaches 7; the series goes L then W.
    expect(campaignKickoffs(promoted)).toEqual({
      first: matches[0].playedAt,
      last: matches[4].playedAt,
    });
    expect(campaignKickoffs(next)).toBeNull();
  });

  it("includes a Relegation Match", () => {
    // Division 4 from the start: three losses use every Chance, then the Relegation Match.
    const matches = run("LLLW");
    const [campaign] = replayCampaigns(
      matches,
      [SEASON_START],
      startingIn(5),
    ).campaigns;
    expect(campaign.relegationMatch).not.toBeNull();
    expect(campaignKickoffs(campaign)).toEqual({
      first: matches[0].playedAt,
      last: matches[3].playedAt,
    });
  });
});
