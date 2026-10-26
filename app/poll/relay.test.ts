import { describe, expect, it } from "vitest";

import { matchesRequest } from "../ea/endpoints.ts";
import type { CollectedPoll } from "./collect.ts";
import { parseRelayPoll, RelayPollError, toRelayPoll } from "./relay.ts";

const CLUB = {
  platform: "common-gen5",
  clubId: "332191",
  clubName: "A Bloo Bloo",
};

const poll: CollectedPoll = {
  startedAt: 1_000,
  finishedAt: 2_000,
  aborted: false,
  responses: [
    {
      request: matchesRequest(CLUB, "leagueMatch"),
      fetchedAt: 1_100,
      durationMs: 300,
      response: {
        ok: true,
        status: 200,
        body: '[{"matchId":"1"}]',
        json: [{ matchId: "1" }],
      },
    },
    {
      request: matchesRequest(CLUB, "playoffMatch"),
      fetchedAt: 1_400,
      durationMs: 50,
      response: { ok: false, status: 403, kind: "blocked", error: "HTTP 403" },
    },
  ],
};

/** As the Worker receives it: through JSON. */
function overTheWire(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("parseRelayPoll", () => {
  it("round-trips a collected Poll, parsing each body again", () => {
    const wire = toRelayPoll(poll);
    expect(wire.responses[0].response).not.toHaveProperty("json");
    expect(parseRelayPoll(overTheWire(wire))).toEqual(poll);
  });

  it("records a body that is not JSON as an invalid_json failure", () => {
    const wire = overTheWire(toRelayPoll(poll)) as {
      responses: { response: { body: string } }[];
    };
    wire.responses[0].response.body = "<HTML>Access Denied</HTML>";
    expect(parseRelayPoll(wire).responses[0].response).toMatchObject({
      ok: false,
      status: 200,
      kind: "invalid_json",
    });
  });

  it.each([
    ["not an object", "poll"],
    [
      "too many responses",
      { ...poll, responses: Array(21).fill(poll.responses[0]) },
    ],
    [
      "an unknown endpoint",
      {
        ...poll,
        responses: [
          {
            ...poll.responses[1],
            request: { endpoint: "x", variant: "", query: {} },
          },
        ],
      },
    ],
    [
      "an unknown failure kind",
      {
        ...poll,
        responses: [
          {
            ...poll.responses[1],
            response: { ok: false, status: 500, kind: "boom", error: "" },
          },
        ],
      },
    ],
    ["a negative time", { ...poll, startedAt: -1 }],
    [
      "a non-text query",
      {
        ...poll,
        responses: [
          {
            ...poll.responses[1],
            request: {
              endpoint: "clubs/matches",
              variant: "",
              query: { clubIds: 1 },
            },
          },
        ],
      },
    ],
  ])("refuses %s", (_case, input) => {
    expect(() => parseRelayPoll(overTheWire(input))).toThrow(RelayPollError);
  });
});
