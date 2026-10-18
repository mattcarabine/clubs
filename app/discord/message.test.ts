import { describe, expect, it } from "vitest";

import type { MatchSummary } from "~/stats/matches";
import { summariseRecord } from "~/stats/summaries";

import {
  discordText,
  EMBED_COLOR,
  EMBED_LIMITS,
  type SessionPostInput,
  seasonReviewPostBody,
  sessionPostBody,
} from "./message";
import { retryAfterMs } from "./webhook";

function match(
  matchId: string,
  outcome: MatchSummary["outcome"],
  [goalsFor, goalsAgainst]: [number, number],
  opponent = "Kebab Over6pack",
): MatchSummary {
  return {
    matchId,
    matchType: "League",
    playedAt: new Date("2026-10-17T19:30:00Z"),
    opponent: { clubId: "1", name: opponent },
    goalsFor,
    goalsAgainst,
    outcome,
    dnf: false,
    skillRatings: { ours: null, opponent: null },
  };
}

function input(overrides: Partial<SessionPostInput> = {}): SessionPostInput {
  const matches = [match("m1", "W", [3, 1]), match("m2", "L", [0, 2])];
  return {
    url: "https://clubs.marabine.co.uk/sessions/m1",
    clubName: "A Bloo Bloo",
    start: matches[0].playedAt,
    record: summariseRecord(matches),
    matches,
    players: [
      {
        name: "Kabeeble",
        appearances: 2,
        goals: 3,
        assists: 1,
        averageRating: 8.1,
        manOfTheMatch: 1,
      },
    ],
    headlines: new Map([["m1", "Kabeeble the hero"]]),
    recap: "What a night. Three goals.\n\nThe rest stays on the site.",
    ...overrides,
  };
}

describe("discordText", () => {
  it("escapes Markdown, links and mentions, on one line", () => {
    expect(discordText("@everyone **[x](https://e.example)**\n<@1>")).toBe(
      "@\u200beveryone \\*\\*\\[x\\]\\(https\\://e.example\\)\\*\\* \\<@\u200b1\\>",
    );
  });

  it("leaves plain text alone", () => {
    expect(discordText("Kabeeble's double, 3–1")).toBe(
      "Kabeeble's double, 3–1",
    );
  });
});

describe("sessionPostBody", () => {
  it("is one embed: title, link, colour, recap lede, scorelines and the top performer, pinging nobody", () => {
    const body = sessionPostBody(input());
    expect(body.allowed_mentions).toEqual({ parse: [] });
    const [embed] = body.embeds;
    expect(embed.title).toMatch(/^Session · .* · W1 D0 L1$/);
    expect(embed.url).toBe("https://clubs.marabine.co.uk/sessions/m1");
    expect(embed.color).toBe(EMBED_COLOR);
    expect(embed.description).toBe(
      [
        "What a night. Three goals.",
        "",
        "**W** A Bloo Bloo 3–1 Kebab Over6pack — Kabeeble the hero",
        "**L** A Bloo Bloo 0–2 Kebab Over6pack",
      ].join("\n"),
    );
    expect(embed.fields).toEqual([
      { name: "Top performer", value: "Kabeeble · 3 G · 1 A" },
    ]);
  });

  it("goes without a recap or a top performer", () => {
    const [embed] = sessionPostBody(input({ recap: null, players: [] })).embeds;
    expect(embed.description).toMatch(/^\*\*W\*\*/);
    expect(embed.fields).toEqual([]);
  });

  it("stays within Discord's limits however long the Session", () => {
    const matches = Array.from({ length: 200 }, (_, i) =>
      match(`m${i}`, "W", [9, 0], "x".repeat(40)),
    );
    const [embed] = sessionPostBody(
      input({
        matches,
        record: summariseRecord(matches),
        headlines: new Map(matches.map((m) => [m.matchId, "y".repeat(80)])),
        recap: "z ".repeat(5_000),
      }),
    ).embeds;
    expect(embed.description.length).toBeLessThanOrEqual(
      EMBED_LIMITS.description,
    );
    expect(embed.description).toMatch(/…and \d+ more$/);
    const total =
      embed.title.length +
      embed.description.length +
      embed.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    expect(total).toBeLessThanOrEqual(EMBED_LIMITS.total);
  });
});

describe("seasonReviewPostBody", () => {
  it("announces the review with its link, record and the first three Award winners, pinging nobody", () => {
    const award = (title: string, name: string) => ({
      title,
      name,
      value: "9",
      unit: "goals",
    });
    const body = seasonReviewPostBody({
      url: "https://clubs.marabine.co.uk/seasons/3/review",
      number: 3,
      record: { wins: 12, draws: 3, losses: 6 },
      awards: [
        award("Player of the Season", "@everyone"),
        award("Golden Boot", "Kabeeble"),
        award("Playmaker", "Trevor"),
        award("Most Improved", "Dan"),
      ],
    });
    expect(body.allowed_mentions).toEqual({ parse: [] });
    const [embed] = body.embeds;
    expect(embed.title).toBe("Season 3 Review is in");
    expect(embed.url).toBe("https://clubs.marabine.co.uk/seasons/3/review");
    expect(embed.description).toMatch(/^W12 D3 L6\./);
    expect(embed.fields).toEqual([
      { name: "Player of the Season", value: "@​everyone · 9 goals" },
      { name: "Golden Boot", value: "Kabeeble · 9 goals" },
      { name: "Playmaker", value: "Trevor · 9 goals" },
    ]);
  });
});

describe("retryAfterMs", () => {
  it("reads the body's retry_after in seconds", () => {
    expect(retryAfterMs('{"retry_after":1.5}', "9")).toBe(1_500);
  });

  it("falls back to the Retry-After header, else no wait", () => {
    expect(retryAfterMs("not json", "2")).toBe(2_000);
    expect(retryAfterMs("{}", null)).toBe(0);
  });
});
