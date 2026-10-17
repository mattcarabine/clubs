/**
 * `pnpm fixtures:record [outDir]`: fetches live EA data for Our Club with the Poll's
 * own client and header set, and rewrites `fixtures/ea/` (or `outDir`).
 *
 * Fixtures are sanitised: only the parsed JSON body is kept (EA's response
 * headers, including Akamai's session cookies, are dropped) and it is
 * pretty-printed so fixture changes are reviewable. Nothing is written unless
 * every request succeeds. Never run this in CI (docs/adr/0004).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchEa } from "../app/ea/client.ts";
import { fixtureFileName, recordedRequests } from "../app/ea/endpoints.ts";
import { LIVE_EA_BASE_URL, LIVE_EA_TIMEOUT_MS, OUR_CLUB } from "./live-ea.ts";

const FIXTURES_DIR = path.resolve(
  process.argv[2] ?? path.join(import.meta.dirname, "../fixtures/ea"),
);

const files = new Map<string, unknown>();
for (const request of recordedRequests(OUR_CLUB)) {
  const name = fixtureFileName(request);
  const response = await fetchEa(request, {
    baseUrl: LIVE_EA_BASE_URL,
    timeoutMs: LIVE_EA_TIMEOUT_MS,
  });
  if (!response.ok) {
    console.error(`${name}: ${response.kind} ${response.error}`);
    process.exit(1);
  }
  console.log(`${name}: ${response.status}, ${response.body.length} bytes`);
  files.set(name, response.json);
}

mkdirSync(FIXTURES_DIR, { recursive: true });
for (const [name, json] of files) {
  writeFileSync(
    path.join(FIXTURES_DIR, name),
    `${JSON.stringify(json, null, 2)}\n`,
  );
}
console.log(`Wrote ${files.size} fixtures to ${FIXTURES_DIR}`);
