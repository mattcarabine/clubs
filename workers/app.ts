import { createRequestHandler } from "react-router";

import { handleRelayRoute } from "./relay-routes";
import { runScheduled } from "./scheduled";
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
      (await handleTestRoute(request, env)) ??
        (await handleRelayRoute(request, env)) ??
        (await requestHandler(request)),
    );
  },

  async scheduled(controller, env) {
    await runScheduled(env, new Date(controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
