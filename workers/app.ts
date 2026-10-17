import { createRequestHandler } from "react-router";

import { runPoll } from "../app/poll/run";
import { handleTestRoute } from "./test-routes";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    return (await handleTestRoute(request, env)) ?? requestHandler(request);
  },

  async scheduled(_controller, env) {
    await runPoll(env);
  },
} satisfies ExportedHandler<Env>;
