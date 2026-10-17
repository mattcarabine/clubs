/**
 * Routes that exist only for the E2E suite (docs/adr/0004). They are served
 * only when `TEST_ROUTES` is "1", which is set solely in the `test` Wrangler
 * environment; everywhere else they fall through to the app's 404.
 *
 * - `POST /__test/reset` empties every table, so each test starts clean.
 * - `GET /__test/tables/:name` returns all rows of one table as JSON.
 */

const PREFIX = "/__test/";

export async function handleTestRoute(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (env.TEST_ROUTES !== "1" || !pathname.startsWith(PREFIX)) return null;

  const tables = await appTables(env.DB);
  const route = pathname.slice(PREFIX.length);

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
