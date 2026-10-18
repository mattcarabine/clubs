import { describe, expect, it } from "vitest";

import {
  MAX_PIECE_LENGTH,
  MAX_REPORT_LENGTH,
  sessionWriteups,
} from "./session";

describe("sessionWriteups", () => {
  const ids = ["m1", "m2"];
  const reply = {
    recap: "What a night.",
    matchReports: [
      { matchId: "m1", report: "Won it late." },
      { matchId: "m2", report: "Lost it early." },
    ],
    stateOfTheClub: "Flying.",
  };

  it("stores the recap, a report per Match and the State of the club", () => {
    expect(sessionWriteups(reply, "m1", ids, true)).toEqual([
      { kind: "session", subjectKey: "m1", text: "What a night." },
      { kind: "match", subjectKey: "m1", text: "Won it late." },
      { kind: "match", subjectKey: "m2", text: "Lost it early." },
      { kind: "club", subjectKey: "club", text: "Flying." },
    ]);
  });

  it("takes no State of the club unless it was asked for", () => {
    const { stateOfTheClub: _, ...withoutClub } = reply;
    expect(sessionWriteups(withoutClub, "m1", ids, false)).toHaveLength(3);
    expect(sessionWriteups(reply, "m1", ids, false)).toEqual([]);
    expect(sessionWriteups(withoutClub, "m1", ids, true)).toEqual([]);
  });

  it.each([
    ["an unexpected field", { ...reply, link: "https://spam.example" }],
    [
      "a report for another Match",
      { ...reply, matchReports: [{ matchId: "elsewhere", report: "Spam." }] },
    ],
    [
      "a second report for one Match",
      {
        ...reply,
        matchReports: [
          { matchId: "m1", report: "One." },
          { matchId: "m1", report: "Two." },
        ],
      },
    ],
    [
      "an extra field in a report",
      {
        ...reply,
        matchReports: [{ matchId: "m1", report: "One.", extra: true }],
      },
    ],
    [
      "a recap over its cap",
      { ...reply, recap: "x".repeat(MAX_PIECE_LENGTH + 1) },
    ],
    [
      "a report over its cap",
      {
        ...reply,
        matchReports: [
          { matchId: "m1", report: "x".repeat(MAX_REPORT_LENGTH + 1) },
        ],
      },
    ],
    ["a missing recap", { matchReports: [], stateOfTheClub: "Fine." }],
    ["plain text", "Just text"],
    ["null", null],
  ])("stores nothing from a reply with %s", (_, output) => {
    expect(sessionWriteups(output, "m1", ids, true)).toEqual([]);
  });
});
