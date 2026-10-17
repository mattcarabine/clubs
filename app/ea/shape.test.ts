import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OUR_CLUB } from "../../scripts/live-ea.ts";
import { fixtureFileName, MATCH_TYPES, pollRequests } from "./endpoints.ts";
import { payloadShapeProblems } from "./shape.ts";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, "../../fixtures/ea", name),
      "utf8",
    ),
  );

describe("payloadShapeProblems", () => {
  it.each(
    pollRequests(OUR_CLUB).map((request) => [
      fixtureFileName(request),
      request,
    ]),
  )("accepts the recorded %s", (name, request) => {
    expect(
      payloadShapeProblems(request.endpoint, fixture(name), OUR_CLUB.clubId),
    ).toEqual([]);
  });

  it("accepts an empty Match list, e.g. no Friendlies played", () => {
    expect(payloadShapeProblems("clubs/matches", [], OUR_CLUB.clubId)).toEqual(
      [],
    );
  });

  it("names the path of a player field EA stopped sending", () => {
    const matches = fixture(`clubs-matches-${MATCH_TYPES[0]}.json`) as Array<{
      players: Record<string, Record<string, Record<string, unknown>>>;
    }>;
    const [playerId, stats] = Object.entries(
      matches[0].players[OUR_CLUB.clubId],
    )[0];
    delete stats.rating;

    expect(
      payloadShapeProblems("clubs/matches", matches, OUR_CLUB.clubId),
    ).toEqual([
      `clubs/matches[0].players.${OUR_CLUB.clubId}.${playerId}: missing "rating"`,
    ]);
  });

  it("reports a Match without Our Club", () => {
    const problems = payloadShapeProblems(
      "clubs/matches",
      [
        {
          matchId: "1",
          timestamp: 1,
          clubs: { "9": { result: "1", goals: "1", details: { name: "X" } } },
          players: {},
        },
      ],
      OUR_CLUB.clubId,
    );
    expect(problems).toContain(
      `clubs/matches[0].clubs: missing Our Club (${OUR_CLUB.clubId})`,
    );
    expect(problems).toContain(
      `clubs/matches[0].players: missing Our Club (${OUR_CLUB.clubId})`,
    );
  });

  it("names a renamed Snapshot field", () => {
    const { members } = fixture("members-career-stats.json") as {
      members: Record<string, unknown>[];
    };
    const { ratingAve, ...renamed } = members[0];
    expect(
      payloadShapeProblems(
        "members/career/stats",
        { members: [{ ...renamed, averageRating: ratingAve }] },
        OUR_CLUB.clubId,
      ),
    ).toEqual(['members/career/stats.members[0]: missing "ratingAve"']);
  });

  it("reports when Our Club drops out of the club totals", () => {
    expect(
      payloadShapeProblems("clubs/overallStats", [], OUR_CLUB.clubId),
    ).toEqual([
      `clubs/overallStats: no entry for Our Club (${OUR_CLUB.clubId})`,
    ]);
  });

  it("reports a response that is not the expected container", () => {
    expect(
      payloadShapeProblems("members/stats", { error: "x" }, OUR_CLUB.clubId),
    ).toEqual(['members/stats: missing "members" array']);
    expect(payloadShapeProblems("clubs/matches", {}, OUR_CLUB.clubId)).toEqual([
      "clubs/matches: expected an array",
    ]);
  });
});
