/**
 * Fake Discord webhook (docs/adr/0004, CLUBS-39). Answers `POST` to the
 * webhook path with 204 like Discord's Execute Webhook, records every call,
 * and can be told to fail the next ones. E2E runs never reach Discord.
 */
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  CONTROL_PREFIX,
  type FailNextBody,
  type RecordedPost,
  WEBHOOK_PATH,
} from "./control.ts";

/**
 * `instance` identifies the checkout that started this server; `GET
 * /__control/health?instance=…` answers 200 only when it matches.
 */
export function createFakeDiscord(instance: string): Server {
  let failures: FailNextBody[] = [];
  let posts: RecordedPost[] = [];

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
    } else if (req.method === "GET" && action === "requests") {
      sendJson(res, 200, posts);
    } else if (req.method === "POST" && action === "reset") {
      failures = [];
      posts = [];
      res.writeHead(204).end();
    } else if (req.method === "POST" && action === "fail-next") {
      const { count = 1, ...failure } = JSON.parse(
        await readText(req),
      ) as FailNextBody;
      for (let i = 0; i < count; i++) failures.push(failure);
      res.writeHead(204).end();
    } else {
      sendJson(res, 404, { error: `Unknown control action ${action}` });
    }
  }

  async function handleWebhook(req: IncomingMessage, res: ServerResponse) {
    posts.push({
      path: req.url ?? "",
      body: JSON.parse(await readText(req)),
    });
    const failure = failures.shift();
    if (!failure) {
      res.writeHead(204).end();
    } else if (failure.status === 429) {
      sendJson(res, 429, {
        message: "You are being rate limited.",
        retry_after: failure.retryAfter ?? 1,
        global: false,
      });
    } else {
      sendJson(res, failure.status, { message: "Fake failure", code: 0 });
    }
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
    } else if (req.method === "POST" && url.pathname === WEBHOOK_PATH) {
      handleWebhook(req, res).catch(fail);
    } else {
      sendJson(res, 404, { message: "Unknown Webhook", code: 10015 });
    }
  });
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
