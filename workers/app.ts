import { createRequestHandler } from "react-router";

import { runWriteups } from "../app/ai/run";
import { runPoll } from "../app/poll/run";
import { handleTestRoute } from "./test-routes";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/**
 * The site is private, so no response may be indexed. Static assets never
 * reach the Worker; `public/_headers` gives them the same header.
 */
function noindex(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    return noindex(
      (await handleTestRoute(request, env)) ?? (await requestHandler(request)),
    );
  },

  async scheduled(_controller, env) {
    await runPoll(env);
    // After the Poll's own work, so a write-up never delays or fails it.
    await runWriteups(env);
  },
} satisfies ExportedHandler<Env>;
