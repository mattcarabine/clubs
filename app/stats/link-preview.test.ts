import { describe, expect, it } from "vitest";

import { formatLondonDate, formatLondonDateTime } from "~/lib/london-time";

import {
  matchPreview,
  opponentPreview,
  playerPreview,
  scoreLine,
  seasonReviewPreview,
  sessionPreview,
} from "./link-preview";
import type { PerformerTotals } from "./sessions";
import type { PerformerInput } from "./top-performers";

const PLAYED_AT = new Date("2026-10-17T19:30:00Z");

function appearance(
  name: string,
  stats: Partial<PerformerInput> = {},
): PerformerInput {
  return {
    playerId: name,
    name,
    goals: 0,
    assists: 0,
    rating: 7,
    manOfTheMatch: false,
    ...stats,
  };
}

const MATCH = {
  matchType: "Playoff" as const,
  playedAt: PLAYED_AT,
  outcome: "L" as const,
  dnf: false,
  goalsFor: 3,
  goalsAgainst: 7,
  opponent: { clubId: "1", name: "Kebab Over6pack", crestUrl: null },
  ours: [
    appearance("Trevor", { rating: 6.1 }),
    appearance("Dan", { goals: 2, assists: 1, manOfTheMatch: true }),
  ],
};

describe("scoreLine", () => {
  it("puts Our Club first with an en dash", () => {
    expect(scoreLine("A Bloo Bloo", MATCH)).toBe(
      "A Bloo Bloo 3–7 Kebab Over6pack",
    );
  });
});

describe("matchPreview", () => {
  it("has the Match Type, London kick-off, Outcome and top performer", () => {
    expect(matchPreview("A Bloo Bloo", MATCH)).toEqual({
      title: "A Bloo Bloo 3–7 Kebab Over6pack",
      description: `Playoff · ${formatLondonDateTime(PLAYED_AT)} · Loss · Top performer: Dan, 2 G · 1 A`,
    });
  });

  it("marks a DNF and leaves out a missing top performer", () => {
    const { description } = matchPreview("A Bloo Bloo", {
      ...MATCH,
      outcome: "W",
      dnf: true,
      ours: [],
    });
    expect(description).toBe(
      `Playoff · ${formatLondonDateTime(PLAYED_AT)} · Win (they rage quit)`,
    );
  });

  it("quotes the first sentence of a write-up", () => {
    const { description } = matchPreview("A Bloo Bloo", MATCH, {
      writeUp: "Seven conceded. Nobody tracked back.",
    });
    expect(description.endsWith(" · Seven conceded.")).toBe(true);
  });

  it("leads with the Match's headline", () => {
    const { description } = matchPreview("A Bloo Bloo", MATCH, {
      headline: "Kebab Over6pack run riot as Bloo Bloo collapse",
    });
    expect(description).toBe(
      `Kebab Over6pack run riot as Bloo Bloo collapse · Playoff · ${formatLondonDateTime(PLAYED_AT)} · Loss · Top performer: Dan, 2 G · 1 A`,
    );
  });
});

function performer(
  name: string,
  stats: Partial<PerformerTotals> = {},
): PerformerTotals {
  return {
    name,
    appearances: 4,
    goals: 0,
    assists: 0,
    averageRating: 6.8,
    manOfTheMatch: 0,
    ...stats,
  };
}

const SESSION = {
  start: PLAYED_AT,
  record: {
    played: 8,
    wins: 4,
    draws: 0,
    losses: 4,
    goalsFor: 19,
    goalsAgainst: 17,
  },
  players: [performer("Trevor"), performer("Dan", { manOfTheMatch: 2 })],
};

describe("sessionPreview", () => {
  it("heads with the date and record, and names the top performer", () => {
    expect(sessionPreview(SESSION)).toEqual({
      title: `Session · ${formatLondonDate(PLAYED_AT)} · W4 D0 L4`,
      description:
        "8 Matches · 19 scored, 17 conceded · Top performer: Dan, 6.8",
    });
  });

  it("quotes the first sentence of a recap", () => {
    const { description } = sessionPreview(
      { ...SESSION, players: [] },
      "Four and four. A night of two halves.",
    );
    expect(description).toBe(
      "8 Matches · 19 scored, 17 conceded · Four and four.",
    );
  });
});

describe("playerPreview", () => {
  it("has the Appearances, G, A and average rating", () => {
    expect(
      playerPreview("Dan", {
        appearances: 24,
        goals: 9,
        assists: 6,
        averageRating: 7.42,
      }),
    ).toEqual({
      title: "Dan",
      description: "24 Appearances · 9 G · 6 A · 7.4 average rating",
    });
  });

  it("leaves out a rating nobody has given", () => {
    expect(
      playerPreview("Dan", {
        appearances: 1,
        goals: 0,
        assists: 0,
        averageRating: null,
      }).description,
    ).toBe("1 Appearance · 0 G · 0 A");
  });
});

describe("opponentPreview", () => {
  it("has the head-to-head record", () => {
    expect(
      opponentPreview("A Bloo Bloo", "Kebab Over6pack", {
        played: 3,
        wins: 1,
        draws: 1,
        losses: 1,
        goalsFor: 5,
        goalsAgainst: 4,
      }),
    ).toEqual({
      title: "A Bloo Bloo v Kebab Over6pack",
      description: "Head-to-head W1 D1 L1 · 3 Matches · 5 scored, 4 conceded",
    });
  });
});

describe("seasonReviewPreview", () => {
  it("names the Season, its record and the first two Award winners", () => {
    expect(
      seasonReviewPreview("A Bloo Bloo", {
        number: 3,
        record: {
          played: 21,
          wins: 12,
          draws: 3,
          losses: 6,
          goalsFor: 48,
          goalsAgainst: 30,
        },
        awards: [
          { title: "Player of the Season", name: "Kabeeble" },
          { title: "Golden Boot", name: "Trevor" },
          { title: "Playmaker", name: "Dan" },
        ],
      }),
    ).toEqual({
      title: "Season 3 Review · A Bloo Bloo",
      description:
        "W12 D3 L6 · 21 Matches · 48 scored, 30 conceded · Player of the Season: Kabeeble · Golden Boot: Trevor",
    });
  });
});
