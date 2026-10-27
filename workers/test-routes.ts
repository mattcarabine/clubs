/**
 * Routes that exist only for the E2E suite (docs/adr/0004). They are served
 * only when `TEST_ROUTES` is "1", which is set solely in the `test` Wrangler
 * environment; everywhere else they fall through to the app's 404.
 *
 * - `GET /__test/health?ea=URL&anthropic=URL&discord=URL` is 200 when the
 *   Worker's `EA_BASE_URL` (and `ANTHROPIC_BASE_URL` and
 *   `DISCORD_WEBHOOK_URL`, if given) are those URLs, 409 otherwise, so an
 *   E2E run never reuses a server that calls another checkout's fakes.
 * - `GET /__test/scheduled-without-discord` runs the scheduled handler as
 *   if `DISCORD_WEBHOOK_URL` were not set; `?time=` (epoch ms) sets its
 *   scheduled time, as for `/cdn-cgi/local/scheduled`.
 * - `GET /__test/scheduled-relay-mode` runs the scheduled handler as in
 *   production, where the home relay polls EA (`EA_POLL_SOURCE` "relay").
 * - `POST /__test/reset` empties every table, so each test starts clean.
 * - `GET /__test/tables/:name` returns all rows of one table as JSON.
 * - `POST /__test/poll-runs/age?minutes=N` moves every Poll run N minutes
 *   into the past, e.g. to make the latest Poll stale.
 * - `GET /__test/rows-read` returns `{ rowsRead }`: the D1 rows the app has
 *   read since the last call (`app/db/rows-read.ts`), then starts again at 0.
 * - `POST /__test/milestones/forget` deletes every Milestone and its
 *   comments, as before Milestones were released, so the next Poll backfills.
 *   With `?kind=K` it deletes only that kind's, as before K was added.
 * - `POST /__test/milestones/rename?from=A&to=B` stores kind A's Milestones
 *   as kind B, e.g. as one that is no longer detected (CLUBS-52).
 *
 * Every request also loads `TEST_ROSTER` (Roster entries for players that
 * exist only in E2E specs) into the Roster.
 */
import { enableRowsReadMeter, takeRowsRead } from "../app/db/rows-read";
import { setTestRoster } from "../app/roster";
import { runScheduled } from "./scheduled";

const PREFIX = "/__test/";

export async function handleTestRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const { pathname, searchParams } = new URL(request.url);
  if (env.TEST_ROUTES !== "1") return null;
  setTestRoster(JSON.parse(env.TEST_ROSTER ?? "{}"));
  enableRowsReadMeter();
  if (!pathname.startsWith(PREFIX)) return null;

  const route = pathname.slice(PREFIX.length);
  if (route === "health" && request.method === "GET") {
    const matches = (param: string, value: string | undefined) => {
      const expected = searchParams.get(param);
      return expected === null || expected === value;
    };
    const ours =
      searchParams.get("ea") === env.EA_BASE_URL &&
      matches("anthropic", env.ANTHROPIC_BASE_URL) &&
      matches("discord", env.DISCORD_WEBHOOK_URL);
    return new Response(null, { status: ours ? 200 : 409 });
  }

  if (route === "scheduled-without-discord" && request.method === "GET") {
    // `time` (epoch ms) is the scheduled time, as `/cdn-cgi/local/scheduled` takes it.
    const time = searchParams.get("time");
    await runScheduled(
      { ...env, DISCORD_WEBHOOK_URL: undefined },
      time ? new Date(Number(time)) : undefined,
    );
    return new Response(null, { status: 204 });
  }

  if (route === "scheduled-relay-mode" && request.method === "GET") {
    await runScheduled({ ...env, EA_POLL_SOURCE: "relay" });
    return new Response(null, { status: 204 });
  }

  if (route === "rows-read" && request.method === "GET") {
    return Response.json({ rowsRead: takeRowsRead() });
  }

  const tables = await appTables(env.DB);

  if (route === "reset" && request.method === "POST") {
    if (tables.length) {
      // Deferred so tables can be emptied in any order despite foreign keys.
      await env.DB.batch([
        env.DB.prepare("PRAGMA defer_foreign_keys = on"),
        ...tables.map((table) => env.DB.prepare(`DELETE FROM "${table}"`)),
      ]);
    }
    return new Response(null, { status: 204 });
  }

  if (route === "poll-runs/age" && request.method === "POST") {
    const minutes = Number(searchParams.get("minutes"));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return Response.json(
        { error: "minutes must be a positive number" },
        { status: 400 },
      );
    }
    await env.DB.prepare(
      "UPDATE poll_runs SET started_at = started_at - ?1, finished_at = finished_at - ?1",
    )
      .bind(Math.round(minutes * 60_000))
      .run();
    return new Response(null, { status: 204 });
  }

  if (route === "milestones/forget" && request.method === "POST") {
    const kind = searchParams.get("kind");
    await env.DB.batch(
      kind
        ? [env.DB.prepare("DELETE FROM milestones WHERE kind = ?").bind(kind)]
        : [
            env.DB.prepare("DELETE FROM ai_writeups WHERE kind = 'milestone'"),
            env.DB.prepare("DELETE FROM ai_jobs WHERE kind = 'milestone'"),
            env.DB.prepare("DELETE FROM milestones"),
          ],
    );
    return new Response(null, { status: 204 });
  }

  if (route === "milestones/rename" && request.method === "POST") {
    await env.DB.prepare("UPDATE milestones SET kind = ? WHERE kind = ?")
      .bind(searchParams.get("to"), searchParams.get("from"))
      .run();
    return new Response(null, { status: 204 });
  }

  const table = route.match(/^tables\/(\w+)$/)?.[1];
  if (table && request.method === "GET") {
    if (!tables.includes(table)) {
      return Response.json(
        { error: `Unknown table ${table}` },
        { status: 404 },
      );
    }
    const { results } = await env.DB.prepare(
      `SELECT * FROM "${table}" ORDER BY rowid`,
    ).all();
    return Response.json(results);
  }

  return Response.json({ error: "Unknown test route" }, { status: 404 });
}

/** Tables created by our migrations, excluding SQLite's and Wrangler's own. */
async function appTables(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
    )
    .all<{ name: string }>();
  return results.map((row) => row.name);
}
