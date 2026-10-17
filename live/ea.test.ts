/**
 * Live EA: every request the Poll makes, sent to the real API with the Poll's
 * own client and Chrome header set, must succeed and still have every field
 * the parser and stats pages read. Run with `pnpm test:live`; never in CI.
 */
import { describe, expect, it } from "vitest";

import { fetchEa } from "../app/ea/client.ts";
import { fixtureFileName, pollRequests } from "../app/ea/endpoints.ts";
import { payloadShapeProblems } from "../app/ea/shape.ts";
import {
  LIVE_EA_BASE_URL,
  LIVE_EA_TIMEOUT_MS,
  OUR_CLUB,
} from "../scripts/live-ea.ts";

describe("live EA", () => {
  it.each(
    pollRequests(OUR_CLUB).map((request) => [
      fixtureFileName(request).replace(/\.json$/, ""),
      request,
    ]),
  )("%s still has the shape the parser expects", async (_, request) => {
    const response = await fetchEa(request, {
      baseUrl: LIVE_EA_BASE_URL,
      timeoutMs: LIVE_EA_TIMEOUT_MS,
    });
    if (!response.ok) {
      expect.fail(
        `EA request failed (${response.kind}): ${response.error}. "blocked" means Akamai rejected the header set in app/ea/client.ts.`,
      );
    }

    const problems = payloadShapeProblems(
      request.endpoint,
      response.json,
      OUR_CLUB.clubId,
    );
    expect(
      problems,
      `EA changed its response shape:\n  ${problems.join("\n  ")}`,
    ).toEqual([]);
  });
});
