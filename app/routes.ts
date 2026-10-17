import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("styleguide", "routes/styleguide.tsx"),
  route("squad", "routes/squad.tsx"),
  route("trends", "routes/trends/route.tsx"),
  route("analysis", "routes/analysis/route.tsx"),
  route("matches", "routes/matches.tsx"),
  route("matches/:matchId", "routes/match.tsx"),
  route("opponents", "routes/opponents.tsx"),
  route("opponents/:clubId", "routes/opponent.tsx"),
  route("players/:playerId", "routes/player-profile/route.tsx"),
  route("compare", "routes/compare/route.tsx"),
  // Test-only: 404s outside the `test` Wrangler env and dev (see the route).
  route("test/stats", "routes/test-stats.tsx"),
] satisfies RouteConfig;
