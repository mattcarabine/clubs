/**
 * Helpers for the write-up specs (CLUBS-35): Sessions seeded on the fake EA
 * upstream, and the rows write-ups leave in D1.
 */
import type { AddMatchBody } from "../fake-ea/control.ts";
import type { fakeEa as FakeEa } from "./fake-ea.ts";
import { draw, loss, OUR_CLUB_ID, win, withLineup } from "./match-builders.ts";

const MINUTE_MS = 60_000;

export const KAB = { id: "935000001", name: "Kabeeble" };
export const TREV = { id: "935000002", name: "Trevor" };

/** Kabeeble scores in every Match, Trevor plays alongside. */
function lineup(body: AddMatchBody): AddMatchBody {
  return withLineup(body, [
    { player: KAB, goals: 1, rating: 8.4, stats: { shots: "4" } },
    { player: TREV, rating: 6.5 },
  ]);
}

const BUILDERS = { W: win, D: draw, L: loss };

/**
 * Serves one Session: a Match per result, 30 minutes apart, the first
 * `startedMinutesAgo` minutes ago. Match IDs are `idPrefix` plus 1, 2, ...
 * Returns the Match IDs, oldest first; the first is the Session's ID.
 */
export async function serveSession(
  fakeEa: typeof FakeEa,
  {
    idPrefix,
    startedMinutesAgo,
    results,
    opponentName,
  }: {
    idPrefix: string;
    startedMinutesAgo: number;
    results: ReadonlyArray<keyof typeof BUILDERS>;
    /** Renames the Opponent, as any EA user can. */
    opponentName?: string;
  },
): Promise<string[]> {
  const start = Date.now() - startedMinutesAgo * MINUTE_MS;
  const ids: string[] = [];
  for (const [i, result] of results.entries()) {
    const matchId = `${idPrefix}${i + 1}`;
    ids.push(matchId);
    const body = lineup(
      BUILDERS[result]({
        matchId,
        playedAt: new Date(start + i * 30 * MINUTE_MS),
      }),
    );
    if (opponentName) {
      for (const [clubId, club] of Object.entries(body.match.clubs)) {
        if (clubId !== OUR_CLUB_ID)
          club.details = { ...club.details, name: opponentName };
      }
    }
    await fakeEa.addMatch(body);
  }
  return ids;
}

export interface AiJobRow {
  id: number;
  kind: string;
  subject_key: string;
  version: string;
  status: string;
  attempts: number;
  last_error: string | null;
  input_hash: string | null;
  input: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | null;
}

export interface AiWriteupRow {
  id: number;
  job_id: number;
  kind: string;
  subject_key: string;
  text: string;
}

export interface PollRunRow {
  status: string;
}
