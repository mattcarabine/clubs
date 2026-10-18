import { index, type RouteConfig, route } from "@react-router/dev/routes";

import { POLL_STATE_PATH } from "./lib/paths";

export default [
  index("routes/home.tsx"),
  route("styleguide", "routes/styleguide.tsx"),
  route("squad", "routes/squad.tsx"),
  route("trends", "routes/trends/route.tsx"),
  route("analysis", "routes/analysis/route.tsx"),
  route("matches", "routes/matches.tsx"),
  route("matches/:matchId", "routes/match.tsx"),
  route("milestones", "routes/milestones.tsx"),
  route("sessions", "routes/sessions.tsx"),
  route("sessions/:sessionId", "routes/session.tsx"),
  route("opponents", "routes/opponents.tsx"),
  route("opponents/:clubId", "routes/opponent.tsx"),
  route("players/:playerId", "routes/player-profile/route.tsx"),
  // Reached only from its Discord post (CLUBS-45): no page links here.
  route("seasons/:number/review", "routes/season-review.tsx"),
  route("compare", "routes/compare/route.tsx"),
  route(POLL_STATE_PATH, "routes/poll-state.ts"),
  // Test-only: 404s outside the `test` Wrangler env and dev (see the route).
  route("test/stats", "routes/test-stats.tsx"),
] satisfies RouteConfig;
