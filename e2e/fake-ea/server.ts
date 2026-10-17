/**
 * Fake EA Pro Clubs upstream (docs/adr/0004). Serves the recorded Raw
 * Payloads in `fixtures/ea/` at the same paths as `proclubs.ea.com/api/fc/`,
 * and exposes a control API so tests can add Matches, swap payloads and
 * simulate failures. All state resets with `POST /__control/reset`.
 */
import { readdirSync, readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import {
  EA_ENDPOINTS,
  type EaEndpoint,
  fixtureFileName,
  MAX_MATCHES_PER_TYPE,
  OPPONENT_RATINGS_VARIANT,
} from "../../app/ea/endpoints.ts";
import type { EaMatch } from "../../app/ea/types.ts";
import {
  type AddMatchBody,
  CONTROL_PREFIX,
  EA_PREFIX,
  type FailNextBody,
  type FailureTarget,
  type RecordedRequest,
  type SetPayloadBody,
} from "./control.ts";

/** A "timed out" request is answered eventually so sockets never leak. */
const HANG_MS = 30_000;

type Failure = ({ status: number } | { timeout: true }) & {
  target?: FailureTarget;
};

interface State {
  /** Response bodies keyed by fixture file name. */
  payloads: Map<string, unknown>;
  failures: Failure[];
  requests: RecordedRequest[];
}

/**
 * `instance` identifies the checkout that started this server; `GET
 * /__control/health?instance=…` answers 200 only when it matches.
 */
export function createFakeEa(fixturesDir: string, instance: string): Server {
  const loadFixtures = () =>
    new Map(
      readdirSync(fixturesDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => [
          file,
          JSON.parse(readFileSync(path.join(fixturesDir, file), "utf8")),
        ]),
    );

  const state: State = {
    payloads: loadFixtures(),
    failures: [],
    requests: [],
  };
  const hanging = new Set<ServerResponse>();

  const control: Record<string, (body: unknown) => void> = {
    reset() {
      state.payloads = loadFixtures();
      state.failures = [];
      state.requests = [];
      for (const res of hanging) sendJson(res, 504, { error: "reset" });
      hanging.clear();
    },
    matches(body) {
      const { matchType, match } = body as AddMatchBody;
      const key = fixtureFileName({
        endpoint: "clubs/matches",
        variant: matchType,
      });
      const existing = (state.payloads.get(key) as EaMatch[] | undefined) ?? [];
      state.payloads.set(key, [match, ...existing]);
    },
    payload(body) {
      const { endpoint, variant = "", body: payload } = body as SetPayloadBody;
      state.payloads.set(fixtureFileName({ endpoint, variant }), payload);
    },
    "fail-next"(body) {
      const { count = 1, ...failure } = body as FailNextBody;
      for (let i = 0; i < count; i++) state.failures.push(failure as Failure);
    },
  };

  function handleEa(req: IncomingMessage, res: ServerResponse, url: URL) {
    const endpoint = url.pathname.slice(EA_PREFIX.length);
    const query = Object.fromEntries(url.searchParams);
    const params: Record<string, string[]> = {};
    for (const key of url.searchParams.keys()) {
      params[key] = url.searchParams.getAll(key);
    }
    state.requests.push({
      endpoint,
      query,
      params,
      headers: req.headers as Record<string, string>,
    });

    const failureIndex = state.failures.findIndex(({ target }) =>
      targets(target, endpoint, params.clubIds ?? []),
    );
    const failure =
      failureIndex === -1
        ? undefined
        : state.failures.splice(failureIndex, 1)[0];
    if (failure && "timeout" in failure) {
      hanging.add(res);
      setTimeout(() => {
        if (hanging.delete(res)) sendJson(res, 504, { error: "timeout" });
      }, HANG_MS).unref();
      return;
    }
    if (failure) {
      // Akamai answers a block with a small HTML page, not JSON.
      res.writeHead(failure.status, { "content-type": "text/html" });
      res.end("<HTML><HEAD><TITLE>Access Denied</TITLE></HEAD></HTML>");
      return;
    }

    if (!isEndpoint(endpoint)) {
      sendJson(res, 404, { error: `Unknown endpoint ${endpoint}` });
      return;
    }
    const variant = endpoint === "clubs/matches" ? (query.matchType ?? "") : "";
    const payload = state.payloads.get(fixtureFileName({ endpoint, variant }));
    if (payload === undefined) {
      sendJson(res, 404, { error: `No fixture for ${endpoint} ${variant}` });
      return;
    }
    sendJson(res, 200, respond(endpoint, payload, params));
  }

  function respond(
    endpoint: EaEndpoint,
    payload: unknown,
    params: Record<string, string[]>,
  ): unknown {
    if (endpoint === "clubs/matches") {
      return latestMatches(payload as EaMatch[], params.maxResultCount?.[0]);
    }
    if (endpoint === "clubs/overallStats" && Array.isArray(payload)) {
      return overallStats(payload, params.clubIds ?? []);
    }
    return payload;
  }

  /**
   * Like EA, answers with an entry per requested club it knows, from Our
   * Club's fixture and the recorded Opponents', and leaves the rest out.
   */
  function overallStats(ours: unknown[], clubIds: string[]): unknown[] {
    const opponents = state.payloads.get(
      fixtureFileName({
        endpoint: "clubs/overallStats",
        variant: OPPONENT_RATINGS_VARIANT,
      }),
    );
    const known = [...ours, ...(Array.isArray(opponents) ? opponents : [])];
    return known.filter((club) =>
      clubIds.includes(String((club as { clubId?: unknown })?.clubId)),
    );
  }

  async function handleControl(
    req: IncomingMessage,
    res: ServerResponse,
    action: string,
    query: URLSearchParams,
  ) {
    if (req.method === "GET" && action === "health") {
      // 409 for another checkout's `instance`, so Playwright never reuses it.
      const ours = query.get("instance") === instance;
      sendJson(res, ours ? 200 : 409, { instance });
      return;
    }
    if (req.method === "GET" && action === "requests") {
      sendJson(res, 200, state.requests);
      return;
    }
    const handler = control[action];
    if (req.method !== "POST" || !handler) {
      sendJson(res, 404, { error: `Unknown control action ${action}` });
      return;
    }
    handler(await readJson(req));
    res.writeHead(204).end();
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith(CONTROL_PREFIX)) {
      handleControl(
        req,
        res,
        url.pathname.slice(CONTROL_PREFIX.length),
        url.searchParams,
      ).catch((error: unknown) => sendJson(res, 400, { error: String(error) }));
    } else if (url.pathname.startsWith(EA_PREFIX)) {
      handleEa(req, res, url);
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  });
}

/** EA returns the most recent Matches first, capped at 10, with no paging. */
function latestMatches(matches: EaMatch[], maxResultCount = "10"): EaMatch[] {
  const limit = Math.min(Number(maxResultCount) || 0, MAX_MATCHES_PER_TYPE);
  return [...matches].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

function targets(
  target: FailureTarget | undefined,
  endpoint: string,
  clubIds: string[],
): boolean {
  return (
    (!target?.endpoint || target.endpoint === endpoint) &&
    (!target?.clubId || clubIds.includes(target.clubId))
  );
}

function isEndpoint(endpoint: string): endpoint is EaEndpoint {
  return (EA_ENDPOINTS as readonly string[]).includes(endpoint);
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "max-age=300",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text ? JSON.parse(text) : undefined;
}
