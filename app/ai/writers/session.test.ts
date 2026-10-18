import { describe, expect, it } from "vitest";

import { sessionWriteups } from "./session";

describe("sessionWriteups", () => {
  const ids = ["m1", "m2"];

  it("stores the recap, a report per Match and the State of the club", () => {
    expect(
      sessionWriteups(
        {
          recap: "What a night.",
          matchReports: [
            { matchId: "m1", report: "Won it late." },
            { matchId: "m2", report: "Lost it early." },
          ],
          stateOfTheClub: "Flying.",
        },
        "m1",
        ids,
      ),
    ).toEqual([
      { kind: "session", subjectKey: "m1", text: "What a night." },
      { kind: "match", subjectKey: "m1", text: "Won it late." },
      { kind: "match", subjectKey: "m2", text: "Lost it early." },
      { kind: "club", subjectKey: "club", text: "Flying." },
    ]);
  });

  it("skips reports for other Matches, repeats and anything off-schema", () => {
    expect(
      sessionWriteups(
        {
          recap: "Recap.",
          matchReports: [
            { matchId: "elsewhere", report: "Not ours." },
            { matchId: "m2", report: "First." },
            { matchId: "m2", report: "Again." },
            { matchId: "m1" },
            "nonsense",
          ],
        },
        "m1",
        ids,
      ),
    ).toEqual([
      { kind: "session", subjectKey: "m1", text: "Recap." },
      { kind: "match", subjectKey: "m2", text: "First." },
    ]);
  });

  it("stores nothing from a reply that is not an object", () => {
    expect(sessionWriteups("Just text", "m1", ids)).toEqual([]);
    expect(sessionWriteups(null, "m1", ids)).toEqual([]);
  });
});
