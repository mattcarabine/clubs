import { describe, expect, it } from "vitest";

import { coachingWriteups, MAX_POINT_LENGTH } from "./coaching";

const IDS = ["1", "2"];

function note(playerId: string, points: unknown[] = ["Works.", "Focus."]) {
  return { playerId, points };
}

describe("coachingWriteups", () => {
  it("stores one write-up per Squad Member, its points as paragraphs", () => {
    const drafts = coachingWriteups(
      {
        notes: [note("1", ["Passing  is\nsharp.", "Shoot early."]), note("2")],
      },
      IDS,
    );
    expect(drafts).toEqual([
      {
        kind: "coaching",
        subjectKey: "1",
        text: "Passing is sharp.\n\nShoot early.",
      },
      { kind: "coaching", subjectKey: "2", text: "Works.\n\nFocus." },
    ]);
  });

  it.each([
    ["a missing Squad Member", { notes: [note("1")] }],
    ["someone not in the input", { notes: [note("1"), note("2"), note("3")] }],
    ["a Squad Member twice", { notes: [note("1"), note("1"), note("2")] }],
    ["no points", { notes: [note("1", []), note("2")] }],
    [
      "five points",
      { notes: [note("1", ["a", "b", "c", "d", "e"]), note("2")] },
    ],
    ["an empty point", { notes: [note("1", ["a", " "]), note("2")] }],
    ["a non-text point", { notes: [note("1", ["a", 3]), note("2")] }],
    [
      "an overlong point",
      { notes: [note("1", ["x".repeat(MAX_POINT_LENGTH + 1)]), note("2")] },
    ],
    ["an extra field", { notes: [note("1"), note("2")], signOff: "Coach" }],
    [
      "an extra field on a note",
      { notes: [{ ...note("1"), extra: 1 }, note("2")] },
    ],
    ["no notes", { notes: "none" }],
    ["text", "Some prose"],
  ])("rejects a reply with %s", (_, output) => {
    expect(coachingWriteups(output, IDS)).toEqual([]);
  });
});
