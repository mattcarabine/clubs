/**
 * `GET /api/poll-state`: the latest Poll's `PollState` as JSON, for pages that
 * refresh themselves (`useLivePoll`). Two rows read, however much data there is.
 */
import { env } from "cloudflare:workers";

import { getDb } from "~/db/client";
import { pollState } from "~/stats";

export async function loader() {
  return Response.json(await pollState(getDb(env.DB)), {
    headers: { "Cache-Control": "no-store" },
  });
}
