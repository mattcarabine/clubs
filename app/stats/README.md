# `app/stats/`: the stats read model

Every number a page shows comes from here. Pages never write SQL or repeat a formula.

## Using it in a page

```ts
import { env } from "cloudflare:workers";
import { getDb } from "~/db/client";
import { FilterBar } from "~/components";
import { clubRecord, listMatches, statsFilterFromRequest } from "~/stats";

export async function loader({ request }: Route.LoaderArgs) {
  const db = getDb(env.DB);
  const filter = statsFilterFromRequest(request);
  const [record, matches] = await Promise.all([
    clubRecord(db, filter),
    listMatches(db, filter, { limit: 20 }),
  ]);
  return { filter, record, matches };
}
// In the component: <FilterBar filter={loaderData.filter} />
```

`app/routes/test-stats.tsx` is a complete working example (test-only, at `/test/stats`).

Loaders import from `~/stats`. Components that only need the filter or a formula import `~/stats/filter` or `~/stats/formulas` directly, so the query modules stay out of the client bundle.

## Modules

| Module | What it holds |
|---|---|
| `formulas.ts` | Pure maths: `per90`, `passPercentage`, `tacklePercentage`, `average`, `form` (last 5 ratings), `rollingAverage`, `outcomeFromScore`, `oppositeOutcome`, `points`, `cumulativePoints`, `winPercentage`, `currentStreak`, `minutesPlayed`. Uncomputable values are `null`, never `NaN`. |
| `summaries.ts` | Pure roll-ups: `summariseRecord` (W/D/L, goals, points, DNFs), `summariseAppearances` (a Squad Member's totals, per-90s, %s, Form), `groupBy`. |
| `filter.ts` | `StatsFilter` and the URL format: `parseStatsFilter`, `statsFilterFromRequest`, `writeStatsFilter`, `toggleMatchType`, `parseMinAppearances` / `writeMinAppearances` (leaderboard minimum, default 3). |
| `scope.ts` | `matchScope(db, filter, { opponentClubId, now })`: the SQL condition behind every query, and `isOurAppearance`. |
| `convert.ts` | Stored values to `~/lib/domain` ones (`"win"` to `"W"`, `"league"` to `"League"`, and so on). |
| `matches.ts` | `listMatches`, `countMatches`, `latestMatch`, `clubRecord`, `getMatch` (both line-ups). |
| `squad.ts` | `squadAppearances` (Our Club's Appearances with Match context, oldest first), `squadLeaderboard`, `getSquadMember`. |
| `opponents.ts` | `opponentRecords` (head-to-head per Opponent), `getOpponent`. Head-to-head Match lists and top performers use `listMatches` / `squadLeaderboard` with `{ opponentClubId }`. |
| `seasons.ts` | `listSeasons`: every Season the Poll has detected, oldest first. The root loader passes their numbers to every `FilterBar`. |
| `snapshots.ts` | `clubSnapshots`, `memberSnapshots`, `snapshotNumber`, `lastSuccessfulPoll`. Not filtered: they are EA's own totals. |

Europe/London date formatting and day/hour buckets live in `~/lib/london-time` (`formatLondonDateTime`, `londonParts`, `londonDateKey`, ...).

## The filter

- URL: `?types=league,playoff,friendly&dnf=0&range=last10|30d|all&season=2&minApps=1`. Defaults (Competitive Matches, DNF included, all dates, all Seasons, min 3) are left out of the URL.
- Season: `filter.season` is a Season number, absent for all Seasons. A Match belongs to the latest Season that started at or before it was played, worked out in `matchScope` at query time, so Matches stored before a boundary was detected still land in the right Season. The Poll detects a new Season when the current-season leaderboard Snapshot's `gamesPlayed` goes down (`app/poll/seasons.ts`); Season 1 starts at the epoch. The FilterBar shows the Season picker once there are two Seasons.
- Changing the filter resets `page`; other params are kept.
- "Last 10" means Our Club's 10 latest Matches that pass the other conditions (including `opponentClubId`), not each Squad Member's last 10 Appearances. Say so in UI copy where it matters.
- `squadLeaderboard` applies the minimum of 3 Appearances unless told otherwise; pass `minAppearances` (e.g. 1 for top performers against one Opponent).
- DNF Matches are counted by default. Every `MatchSummary` and `SquadAppearance` carries `dnf`, so flag them in the UI.

## Adding a query

1. Put it in the module for its subject (or a new one, exported from `index.ts`).
2. Take `(db: Db, filter: StatsFilter, options?)` and pass `filter` through `matchScope`, so the FilterBar applies.
3. Return domain types (`Outcome`, `MatchType`, `PositionGroup`, `Date`), converted with `convert.ts`, never raw columns.
4. Keep maths out of SQL: fetch rows, then compute with `formulas.ts` / `summaries.ts`. Add a unit test for any new formula.
5. Mind the free plan (ADR 0001): one or two queries per loader, no N+1. Run independent queries with `Promise.all`.

## Adding a filter dimension

Add the field to `StatsFilter` and `DEFAULT_STATS_FILTER`, read it in `parseStatsFilter`, write it in `writeStatsFilter`, add its condition in `matchScope`, and add a control to `FilterBar` (`app/components/filter-bar.tsx`).
