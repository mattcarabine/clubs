import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("styleguide", "routes/styleguide.tsx"),
  route("matches", "routes/matches.tsx"),
  route("matches/:matchId", "routes/match.tsx"),
  route("players/:playerId", "routes/player-profile/route.tsx"),
  // Test-only: 404s outside the `test` Wrangler env and dev (see the route).
  route("test/stats", "routes/test-stats.tsx"),
] satisfies RouteConfig;
