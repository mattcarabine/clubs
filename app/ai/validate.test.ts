import { describe, expect, it } from "vitest";

import { proseProblems } from "./validate";

describe("proseProblems", () => {
  // Real sentences from production write-ups before CLUBS-48.
  it.each([
    ["The Dropped Points were grim", "Dropped Points"],
    ["Back on track with a 5-2 DNF Win over Free Ellis", "DNF"],
    ["That's 7.0, 9.2, 9.5, so call it Hot form and then some", "Hot form"],
    ["Kabeeble played zero minutes", "zero-minutes"],
    ["Loltown95 logged zero minutes and we managed one shot", "zero-minutes"],
    ["Not a single completed pass between the four of us", "zero-shots"],
    [
      "Hardly Athletik put four past us, and we did not register a shot",
      "zero-shots",
    ],
    [
      "We registered no shots, and their tackle success sat at 56%",
      "zero-shots",
    ],
    ["Kabeeble and JONTEeu didn't complete a pass between them", "zero-shots"],
    ["Mucky Mayhem, rated 1831, won 0-3", "rated 1589"],
    ["Mucky Mayhem, rated 1831, won 0-3", '"0-3", not written winner first'],
    ["KEBAB OVER6PACK won 3-7", '"3-7", not written winner first'],
    ["a 4-6 loss to a 11 disciples side", '"4-6", not written winner first'],
    ["The Outcome Split says we pass better in Wins", "Outcome Split"],
    ["Every Squad Member chipped in", "Squad Member"],
  ])("rejects %j (%s)", (sentence, problem) => {
    expect(proseProblems(sentence).join("; ")).toContain(problem);
  });

  it('allows "since records began" once a piece', () => {
    const once = "His best since records began.";
    expect(proseProblems(once)).toEqual([]);
    expect(proseProblems(`${once} The best run since records began.`)).toEqual([
      '"since records began" more than once',
    ]);
  });

  it("rejects month framing only while tracking covers under 30 days", () => {
    const sentence = "JONTEeu took the award and a new best rating in a month.";
    expect(proseProblems(sentence, { trackedDays: 5 })).toEqual([
      '"in a month" framing, when records only cover 5 days',
    ]);
    expect(proseProblems(sentence, { trackedDays: 45 })).toEqual([]);
    expect(proseProblems(sentence)).toEqual([]);
  });

  it.each([
    "Mucky Mayhem won 3-0 and A Bloo Bloo were outclassed, then bailed.",
    "A 1,831-rated side ran riot, 7–3 at the whistle.",
    "Kick-offs between 18:00–20:00 suit us; Kabeeble's 8.7 led the way.",
    "Loltown95 took two shots, scored twice and set up a third in a 4-1 rout.",
    "Rage quit at 3-0 down after 8 minutes. Nothing to say.",
    "Lined up 4-2-3-1, then a 3-5-2, and still conceded 2-3 goals a night.",
    "Between minutes 15-20 it fell apart; a 2-1 win all the same.",
  ])("passes clean prose: %j", (sentence) => {
    expect(proseProblems(sentence)).toEqual([]);
  });
});
