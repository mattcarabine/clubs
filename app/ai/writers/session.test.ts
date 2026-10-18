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
      { matchId: "m1", report: "Won it late.", headline: "Late show" },
      { matchId: "m2", report: "Lost it early.", headline: "Early bath" },
    ],
    stateOfTheClub: "Flying.",
  };

  it("stores the recap, a report and headline per Match and the State of the club", () => {
    expect(sessionWriteups(reply, "m1", ids, true)).toEqual([
      { kind: "session", subjectKey: "m1", text: "What a night." },
      { kind: "match", subjectKey: "m1", text: "Won it late." },
      { kind: "headline", subjectKey: "m1", text: "Late show" },
      { kind: "match", subjectKey: "m2", text: "Lost it early." },
      { kind: "headline", subjectKey: "m2", text: "Early bath" },
      { kind: "club", subjectKey: "club", text: "Flying." },
    ]);
  });

  it("cuts a headline over 80 characters to fit, on one line", () => {
    const long = `Bloo Bloo\n${"collapse ".repeat(12)}`;
    const [, , headline] = sessionWriteups(
      {
        ...reply,
        matchReports: [{ matchId: "m1", report: "Won.", headline: long }],
      },
      "m1",
      ["m1"],
      true,
    );
    expect(headline.kind).toBe("headline");
    expect(headline.text.length).toBeLessThanOrEqual(80);
    expect(headline.text).toMatch(/^Bloo Bloo collapse .*…$/);
  });

  it("takes nothing when a Match is missing its report, or a piece is blank (CLUBS-48)", () => {
    const [first] = reply.matchReports;
    expect(
      sessionWriteups({ ...reply, matchReports: [first] }, "m1", ids, true),
    ).toEqual([]);
    expect(
      sessionWriteups({ ...reply, stateOfTheClub: " " }, "m1", ids, true),
    ).toEqual([]);
    expect(
      sessionWriteups(
        {
          ...reply,
          matchReports: [{ ...first, report: "" }, reply.matchReports[1]],
        },
        "m1",
        ids,
        true,
      ),
    ).toEqual([]);
  });

  it("takes no State of the club unless it was asked for", () => {
    const { stateOfTheClub: _, ...withoutClub } = reply;
    expect(sessionWriteups(withoutClub, "m1", ids, false)).toHaveLength(5);
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
          { matchId: "m1", report: "One.", headline: "One" },
          { matchId: "m1", report: "Two.", headline: "Two" },
        ],
      },
    ],
    [
      "an extra field in a report",
      {
        ...reply,
        matchReports: [
          { matchId: "m1", report: "One.", headline: "One", extra: true },
        ],
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
          {
            matchId: "m1",
            report: "x".repeat(MAX_REPORT_LENGTH + 1),
            headline: "One",
          },
        ],
      },
    ],
    [
      "a report without a headline",
      { ...reply, matchReports: [{ matchId: "m1", report: "One." }] },
    ],
    ["a missing recap", { matchReports: [], stateOfTheClub: "Fine." }],
    ["plain text", "Just text"],
    ["null", null],
  ])("stores nothing from a reply with %s", (_, output) => {
    expect(sessionWriteups(output, "m1", ids, true)).toEqual([]);
  });
});
