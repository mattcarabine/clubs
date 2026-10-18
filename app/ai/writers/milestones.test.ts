import { describe, expect, it } from "vitest";

import { MAX_COMMENT_LENGTH, milestoneWriteups } from "./milestones";

describe("milestoneWriteups", () => {
  const ids = ["7", "8"];
  const reply = {
    comments: [
      { milestoneId: "7", comment: "Fifty and counting." },
      { milestoneId: "8", comment: "A record night." },
    ],
  };

  it("stores a comment per Milestone, keyed by its ID", () => {
    expect(milestoneWriteups(reply, ids)).toEqual([
      { kind: "milestone", subjectKey: "7", text: "Fifty and counting." },
      { kind: "milestone", subjectKey: "8", text: "A record night." },
    ]);
  });

  it.each([
    ["an unexpected field", { ...reply, link: "https://spam.example" }],
    [
      "a comment for another Milestone",
      { comments: [...reply.comments, { milestoneId: "9", comment: "Spam." }] },
    ],
    ["a missing comment", { comments: reply.comments.slice(0, 1) }],
    [
      "two comments for one Milestone",
      { comments: [...reply.comments, reply.comments[0]] },
    ],
    [
      "a comment over the cap",
      {
        comments: [
          reply.comments[0],
          { milestoneId: "8", comment: "x".repeat(MAX_COMMENT_LENGTH + 1) },
        ],
      },
    ],
    ["plain text", "Fifty and counting."],
  ])("stores nothing from a reply with %s", (_, output) => {
    expect(milestoneWriteups(output, ids)).toEqual([]);
  });
});
