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
| `formulas.ts` | Pure maths: `per90`, `passPercentage`, `tacklePercentage`, `average`, `form` (last 5 ratings), `rollingAverage`, `rollingWinPercentage`, `weightedMean` / `weightedVariance`, `effectSize` (Cohen's d, weighted), `standardScore` (one value's distance from a sample's mean in standard deviations) and `winRateEffectSize` (Cohen's h, so Win-rate gaps rank on the same scale), `outcomeFromScore`, `oppositeOutcome`, `points`, `cumulativePoints`, `winPercentage`, `currentStreak`, `minutesPlayed`. Uncomputable values are `null`, never `NaN`. |
| `summaries.ts` | Pure roll-ups: `summariseRecord` (W/D/L, goals, points, DNFs), `summariseAppearances` (a Squad Member's totals, per-90s, %s, Form), `groupBy`. |
| `filter.ts` | `StatsFilter` and the URL format: `parseStatsFilter`, `statsFilterFromRequest`, `writeStatsFilter`, `toggleMatchType`. The date filter: `DateRange` (all, a `DATE_PRESETS` preset, or custom London dates) and `dateWindow`, which turns it into instants. |
| `scope.ts` | `matchScope(db, filter, { opponentClubId, now })`: the SQL condition behind every query, and `isOurAppearance`. |
| `convert.ts` | Stored values to `~/lib/domain` ones (`"win"` to `"W"`, `"league"` to `"League"`, and so on). |
| `matches.ts` | `listMatches`, `countMatches`, `latestMatch`, `clubRecord`, `getMatch` (both line-ups and both clubs' Skill Ratings). |
| `squad.ts` | `squadAppearances` (Our Club's Appearances with Match context, oldest first), `squadLeaderboard`, `getSquadMember`, `listSquadMembers` (the whole Squad, Former included, for pickers). |
| `opponents.ts` | `opponentRecords` (head-to-head per Opponent), `getOpponent` (with the latest Opponent Rating). Head-to-head Match lists and top performers use `listMatches` / `squadLeaderboard` with `{ opponentClubId }`. |
| `positions.ts` | Position Group selections (CLUBS-23), each passed as a parameter so a page can hold several (Compare's `posA` / `posB`): `PositionGroupSelection` (empty is All Positions), `parsePositionGroups` / `writePositionGroups` (the `midfielder,forward` URL value, for any param), `togglePositionGroup`, `inPositionGroups`, `filterByPositionGroups`, `describePositionGroups` ("Midfielder or Forward"). |
| `sessions.ts` | Sessions (CLUBS-25): `sessionPlaces` gives each Match its Session (`session`, equal within one) and place in it (`place`) (kick-offs at most `SESSION_GAP_MINUTES` = 45 apart), over every recorded Match whatever the filter. |
| `outcome-split.ts` | The Outcome Split (CLUBS-25), pure: `outcomeSplit` (performance per 90 over how long each Match ran, both clubs; with and without each Squad Member; squad size; position outliers; kick-off time, weekday or weekend and Session place; "After a result", the Win % in the Match after a Win against after Dropped Points, over any next Match and within a Session (`afterResult`, CLUBS-26); the rolling Win %; and the top findings ranked by effect size), `droppedPointsReasons` (CLUBS-27: one Dropped Points Match against the Wins, its `TOP_DEVIATIONS` biggest deviations in standard deviations, both clubs, per 90), `playerOutcomeSplit` (one Squad Member's Wins against Dropped Points, shared by the Analysis page and the profile panel), `PLAYER_SPLIT_STATS`, and the named thresholds `MIN_SPLIT_MATCHES`, `SMALL_SAMPLE_MATCHES`, `POSITION_OUTLIER_GAP`. Client-safe. |
| `outcome-split-query.ts` | `getOutcomeSplit(db, filter, { positionGroups })`: four parallel queries (Matches, each club's Appearance totals per Match summed in SQL, Our Club's Appearances, every kick-off), then `outcome-split.ts`. `positionGroups` narrows only the per-player rows. `getDroppedPointsReasons(db, match)` feeds the Match page's "Why we dropped points" panel: the Wins over the default filter (Competitive, all time, DNFs included), whatever the page's filters, in two queries, and none for a Win. |
| `recent-change.ts` | Recent changes (CLUBS-37), pure and client-safe: `recentChanges(appearances, name)` sets a Squad Member's last `RECENT_WINDOW` (10) filtered Appearances against every one before (the baseline) for each of `RECENT_STATS` (rating, per-90s, pass / tackle % and conversion weighted like the Outcome Split, Win % and MOTM % by Cohen's h), and reports up to `TOP_RECENT_CHANGES` each way with an effect of at least `MIN_RECENT_EFFECT` and `MIN_RECENT_APPEARANCES` a side, marking "Small sample" under `SMALL_BASELINE_APPEARANCES`. `biggest` (the largest effect either way) feeds the Squad table's Recent column; `splitRecent` is the recent-versus-baseline split anything comparing recent form reuses. `getPlayerProfile` and `squadLeaderboard` apply it after the Position Group selection. |
| `seasons.ts` | `listSeasons`: every Season the Poll has detected, oldest first. The root loader passes their numbers to every `FilterBar`. |
| `snapshots.ts` | `clubSnapshots`, `memberSnapshots`, `snapshotNumber`, `lastSuccessfulPoll`. Not filtered: they are EA's own totals. |
| `ea-totals.ts` | `eaMemberTotals` (each Squad Member's latest `members/stats` and `members/career/stats` Snapshot, in one query), the pure `eaSeasonTotals` / `eaCareerTotals` that read a Snapshot into numbers, and `eaCleanSheets`. Not filtered. |
| `source.ts` | `StatsSource` (`"recorded"` or `"ea"`) and its URL format: `parseStatsSource`, `statsSourceFromRequest`, `writeStatsSource`, `STATS_SOURCE_LABEL`. |
| `comparison-params.ts` | Compare's URL format (CLUBS-20), client-safe: `parseComparisonParams` (`players=A,B`, `scope=together`, `posA` / `posB`), `writeComparisonPlayers` / `writeComparisonScope` / `writeComparisonPositionGroups`, and `comparePath`, which opens Compare from the Squad table or a profile carrying the filter and source over (the global `pos` becomes each side's). |
| `comparison.ts` | `getComparison` (Recorded: each side's totals, form and record, three parallel queries at most) and `getEaComparison` (EA season totals). The pure `compareSides` applies the scope: "Played together" narrows both sides to their Shared Matches (`sharedMatchIds`, whatever positions), then each side counts its own Position Groups; the shared record covers every Shared Match. `isSmallSample` flags figures on fewer than 3 Matches. |

Europe/London date formatting and day/hour buckets live in `~/lib/london-time` (`formatLondonDateTime` and the rest of the time-format convention in CLAUDE.md, `londonParts`, `londonDateKey`, ...).

## The filter

- URL: `?types=league,playoff,friendly&dnf=0&range=7d|30d|1y&season=2`, or `?from=2026-10-05&to=2026-10-12` for a custom range. Defaults (Competitive Matches, DNF included, all dates, all Seasons) are left out of the URL.
- Dates (CLAUDE.md "Date filtering"): Europe/London calendar days, inclusive at both ends, so `to=2026-10-12` takes in a Match at 23:30 London that day. A preset covers today and the days before it (7, 30 or 365), counted from the request's London date, so a shared `range=7d` link stays relative. An invalid range (an unknown preset, a malformed date, `from` after `to`, only one of the two) falls back to all dates. Calendar-date helpers (`isCalendarDate`, `addCalendarDays`, `londonDayStart`) live in `~/lib/london-time`.
- Season: `filter.season` is a Season number, absent for all Seasons. A Match belongs to the latest Season that started at or before it was played, worked out in `matchScope` at query time, so Matches stored before a boundary was detected still land in the right Season. The Poll detects a new Season when the current-season leaderboard Snapshot's `gamesPlayed` goes down (`app/poll/seasons.ts`); Season 1 starts at the epoch. The FilterBar shows the Season picker once there are two Seasons.
- Position Groups: `filter.positionGroups` (`?pos=midfielder,forward`, empty for All Positions) narrows a Squad Member's Appearances, not Matches, so `matchScope` ignores it. Only player-level views apply it, by passing it explicitly: `squadLeaderboard(db, filter, { positionGroups })` keeps every Squad Member who played and counts only their Appearances in those groups (0 Appearances shows "–"), and `getPlayerProfile(db, id, filter, { positionGroups })` narrows totals, form and best Matches but keeps the Position Group split whole. Team-level pages never pass it, and their FilterBar hides the control.
- Changing the filter resets `page`; other params are kept.
- `squadLeaderboard` lists every Squad Member with at least one Appearance in the filtered Matches; there is no minimum.
- DNF Matches are counted by default. Every `MatchSummary` and `SquadAppearance` carries `dnf`, so flag them in the UI.

## Recorded or EA totals

A page that can show either our Recorded Appearances or EA's own totals (the Squad table, later Compare) reads `?source=ea` with `statsSourceFromRequest` and passes it to `<FilterBar source={source} />`. The FilterBar then leads with the Recorded / EA totals toggle and, on EA totals, hides the Match filters and says why. EA totals come from `eaMemberTotals`. They include Matches from before tracking began and have no per-Match figures or minutes, so never show per-90s or Form for them.

## Adding a query

1. Put it in the module for its subject (or a new one, exported from `index.ts`).
2. Take `(db: Db, filter: StatsFilter, options?)` and pass `filter` through `matchScope`, so the FilterBar applies.
3. Return domain types (`Outcome`, `MatchType`, `PositionGroup`, `Date`), converted with `convert.ts`, never raw columns.
4. Keep maths out of SQL: fetch rows, then compute with `formulas.ts` / `summaries.ts`. Add a unit test for any new formula.
5. Mind the free plan (ADR 0001): one or two queries per loader, no N+1. Run independent queries with `Promise.all`.

## Adding a filter dimension

Add the field to `StatsFilter` and `DEFAULT_STATS_FILTER`, read it in `parseStatsFilter`, write it in `writeStatsFilter`, add its condition in `matchScope` (or, for a per-Appearance dimension like Position Groups, an option on the player queries), and add a control to `FilterBar` (`app/components/filter-bar.tsx`).
