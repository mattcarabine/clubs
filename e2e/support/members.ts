import { readFileSync } from "node:fs";
import path from "node:path";

import { fixtureFileName } from "../../app/ea/endpoints.ts";
import { FIXTURES_DIR } from "./match-builders.ts";

type MemberEndpoint = "members/stats" | "members/career/stats";

export interface MembersPayload {
  members: Record<string, string>[];
}

/**
 * A recorded member Snapshot payload with some members' fields overridden,
 * keyed by persona name, for `fakeEa.setPayload(endpoint, ...)`. EA sends
 * every value as a string, so the overrides are strings too.
 *
 *   membersPayload("members/stats", { Kabeeble: { goals: "120" } })
 */
export function membersPayload(
  endpoint: MemberEndpoint,
  overrides: Record<string, Record<string, string>> = {},
): MembersPayload {
  const file = fixtureFileName({ endpoint, variant: "" });
  const payload: MembersPayload = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, file), "utf8"),
  );
  for (const [name, fields] of Object.entries(overrides)) {
    const member = payload.members.find((m) => m.name === name);
    if (!member) throw new Error(`${name} missing from ${file}`);
    Object.assign(member, fields);
  }
  return payload;
}
