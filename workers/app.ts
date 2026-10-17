import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },

  async scheduled(_controller, _env, _ctx) {
    // The Poll is implemented in CLUBS-4.
    console.log(JSON.stringify({ event: "poll", status: "not_implemented" }));
  },
} satisfies ExportedHandler<Env>;
