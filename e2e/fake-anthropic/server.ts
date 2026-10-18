/**
 * Fake Anthropic Messages API (docs/adr/0004, 0006). Answers `POST
 * /v1/messages` like the real API, so the Worker runs its real SDK client
 * against it, and exposes a control API so tests can script replies and
 * failures and read what was sent. E2E runs never reach the real API.
 *
 * Without a scripted reply, it answers a structured-output request with JSON
 * that fits the request's schema: every string reads "Fake <name> (reply N)."
 * and an array of objects with an `enum` property gets one item per value,
 * so a Session's `matchReports` covers each of its Matches.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  CONTROL_PREFIX,
  FAKE_USAGE,
  type FailNextBody,
  type RecordedRequest,
  type ReplyBody,
} from "./control.ts";

/** A "timed out" request is answered eventually so sockets never leak. */
const HANG_MS = 30_000;

interface State {
  replies: ReplyBody[];
  failures: FailNextBody[];
  requests: RecordedRequest[];
}

/**
 * `instance` identifies the checkout that started this server; `GET
 * /__control/health?instance=…` answers 200 only when it matches.
 */
export function createFakeAnthropic(instance: string): Server {
  const state: State = { replies: [], failures: [], requests: [] };
  const hanging = new Set<ServerResponse>();

  const control: Record<string, (body: unknown) => void> = {
    reset() {
      state.replies = [];
      state.failures = [];
      state.requests = [];
      for (const res of hanging) sendJson(res, 504, { error: "reset" });
      hanging.clear();
    },
    reply(body) {
      state.replies.push(body as ReplyBody);
    },
    "fail-next"(body) {
      const { count = 1, ...failure } = body as FailNextBody;
      for (let i = 0; i < count; i++) {
        state.failures.push(failure as FailNextBody);
      }
    },
  };

  async function handleMessages(req: IncomingMessage, res: ServerResponse) {
    const raw = await readText(req);
    const body = JSON.parse(raw) as Record<string, unknown>;
    state.requests.push({
      path: req.url ?? "",
      headers: req.headers as Record<string, string>,
      body,
      raw,
    });
    const replyNumber = state.requests.length;

    const failure = state.failures.shift();
    if (failure && "timeout" in failure) {
      hanging.add(res);
      setTimeout(() => {
        if (hanging.delete(res)) sendJson(res, 504, { error: "timeout" });
      }, HANG_MS).unref();
      return;
    }
    if (failure) {
      sendJson(res, failure.status, {
        type: "error",
        error: {
          type: failure.type ?? "api_error",
          message: failure.message ?? "Fake failure",
        },
      });
      return;
    }

    const scripted = state.replies.shift();
    const content = scripted?.content ?? defaultReply(body, replyNumber);
    sendJson(res, 200, {
      id: `msg_fake_${replyNumber}`,
      type: "message",
      role: "assistant",
      model: body.model,
      content: [
        {
          type: "text",
          text: typeof content === "string" ? content : JSON.stringify(content),
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: FAKE_USAGE,
    });
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
    const text = await readText(req);
    handler(text ? JSON.parse(text) : undefined);
    res.writeHead(204).end();
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const fail = (error: unknown) =>
      sendJson(res, 400, { error: String(error) });
    if (url.pathname.startsWith(CONTROL_PREFIX)) {
      handleControl(
        req,
        res,
        url.pathname.slice(CONTROL_PREFIX.length),
        url.searchParams,
      ).catch(fail);
    } else if (req.method === "POST" && url.pathname === "/v1/messages") {
      handleMessages(req, res).catch(fail);
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  });
}

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
};

/** JSON fitting the request's output schema, or plain text without one. */
function defaultReply(
  body: Record<string, unknown>,
  replyNumber: number,
): string | Record<string, unknown> {
  const format = (body.output_config as { format?: { schema?: Schema } })
    ?.format;
  const suffix = `(reply ${replyNumber}).`;
  if (!format?.schema) return `Fake write-up ${suffix}`;
  return fill(format.schema, "", suffix) as Record<string, unknown>;
}

function fill(schema: Schema, name: string, suffix: string): unknown {
  if (schema.enum) return schema.enum[0];
  switch (schema.type) {
    case "object":
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([key, value]) => [
          key,
          fill(value, key, suffix),
        ]),
      );
    case "array": {
      const items = schema.items ?? {};
      const [key, keyed] =
        Object.entries(items.properties ?? {}).find(([, p]) => p.enum) ?? [];
      if (!key || !keyed?.enum) return [fill(items, name, suffix)];
      // One item per value, its strings naming the value they are for.
      return keyed.enum.map((value) => ({
        ...(fill(items, name, `for ${value} ${suffix}`) as object),
        [key]: value,
      }));
    }
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    default:
      return `Fake ${name} ${suffix}`;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readText(req: IncomingMessage): Promise<string> {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text;
}
