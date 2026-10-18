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
| `summaries.ts` | Pure roll-ups: `summariseRecord` (W/D/L, goals, points, DNFs), `summariseAppearances` (a Squad Member's totals, per-90s, %s, Form), `summariseMatchSides` (both clubs' totals in one Match, for the hero ScoreBar and the Match page), `groupBy`. |
| `filter.ts` | `StatsFilter` and the URL format: `parseStatsFilter`, `statsFilterFromRequest`, `writeStatsFilter`, `toggleMatchType`. The date filter: `DateRange` (all, a `DATE_PRESETS` preset, or custom London dates) and `dateWindow`, which turns it into instants. |
| `scope.ts` | `matchScope(db, filter, { opponentClubId, now, playedBetween })` (`playedBetween` narrows to one Session's kick-offs): the SQL condition behind every query; `isShownMatch` (League and Playoff only) for the queries that ignore the filter; and `isOurAppearance`. |
| `convert.ts` | Stored values to `~/lib/domain` ones (`"win"` to `"W"`, `"league"` to `"League"`, and so on). |
| `matches.ts` | `listMatches`, `countMatches`, `latestMatch`, `clubRecord`, `getMatch` (both line-ups and both clubs' Skill Ratings), `listKickoffs` (every shown Match's kick-off, whatever the filter, for Sessions). |
| `squad.ts` | `squadAppearances` (Our Club's Appearances with Match context, oldest first), `squadLeaderboard` (and the pure `leaderboardRows` behind it, for Appearances already fetched), `squadForm` (the current Squad Members in Hot or Cold form, for Matchday), `getSquadMember`, `listSquadMembers` (the whole Squad, Former included, for pickers). |
| `opponents.ts` | `opponentRecords` (head-to-head per Opponent), `getOpponent` (with the latest Opponent Rating). Head-to-head Match lists and top performers use `listMatches` / `squadLeaderboard` with `{ opponentClubId }`. |
| `positions.ts` | Position Group selections (CLUBS-23), each passed as a parameter so a page can hold several (Compare's `posA` / `posB`): `PositionGroupSelection` (empty is All Positions), `parsePositionGroups` / `writePositionGroups` (the `midfielder,forward` URL value, for any param), `togglePositionGroup`, `inPositionGroups`, `filterByPositionGroups`, `describePositionGroups` ("Midfielder or Forward"). |
| `sessions.ts` | Sessions (CLUBS-25): `sessionPlaces` gives each Match its Session (`session`, equal within one) and place in it (`place`) (kick-offs at most `SESSION_GAP_MINUTES` = 45 apart), over every shown Match whatever the filter. CLUBS-34 adds `groupSessions` (each Session's Match IDs, start and end; its ID is its first Match's), `pageSessions` (pages of whole Sessions), `isTonight` (last kick-off within `TONIGHT_HOURS`) and `sessionTopPerformer`. Pure. |
| `sessions-query.ts` | Sessions worked out per request, with no table (CLUBS-34): `listSessionPage(db, filter, { page, pageSize })` for the Matches page (three queries: kick-offs, the filtered Matches, and the page's Appearances; Sessions are grouped over every shown Match, then filtered, so a partly filtered Session keeps its `matchCount`), `getSession` (the Session page, whatever the filter: its Matches, a leaderboard and `getUsualComparison`), `sessionOfMatch` and `latestSession`. |
| `outcome-split.ts` | The Outcome Split (CLUBS-25), pure: `outcomeSplit` (performance per 90 over how long each Match ran, both clubs; with and without each Squad Member; squad size; position outliers; kick-off time, weekday or weekend and Session place; "After a result", the Win % in the Match after a Win against after Dropped Points, over any next Match and within a Session (`afterResult`, CLUBS-26); the rolling Win %; Win % and highlights by Opponent strength (`byOpponentStrength`, CLUBS-29; groups under `MIN_SPLIT_MATCHES` hidden, unrated Matches counted out); and the top findings ranked by effect size), `droppedPointsReasons` (CLUBS-27: one Dropped Points Match against the Wins, its `TOP_DEVIATIONS` biggest deviations in standard deviations, both clubs, per 90), `usualComparison` (CLUBS-34: a Session's per-90s and rates beside every Match's, once `MIN_SPLIT_MATCHES` Matches fall outside it), `playerOutcomeSplit` (one Squad Member's Wins against Dropped Points, shared by the Analysis page and the profile panel), `PLAYER_SPLIT_STATS`, and the named thresholds `MIN_SPLIT_MATCHES`, `SMALL_SAMPLE_MATCHES`, `POSITION_OUTLIER_GAP`. Client-safe. |
| `skill-rating.ts` | Skill Rating gaps (CLUBS-29), pure and client-safe: `ratingGap` (our Skill Rating minus the Opponent Rating, null unless both are known; every `MatchSummary` carries `skillRatings`), `opponentStrength` (Stronger, Similar or Weaker at `STRENGTH_GAP` = 100 points), `OPPONENT_STRENGTHS`. |
| `outcome-split-query.ts` | `getOutcomeSplit(db, filter, { positionGroups })`: four parallel queries (Matches, each club's Appearance totals per Match summed in SQL, Our Club's Appearances, every kick-off), then `outcome-split.ts`. `positionGroups` narrows only the per-player rows. `getDroppedPointsReasons(db, match)` feeds the Match page's "Why we dropped points" panel: the Wins over the default filter (Competitive, all time, DNFs included), whatever the page's filters, in two queries, and none for a Win. `getUsualComparison(db, matchIds)` feeds the Session page's "Compared with your usual" in one query. |
| `recent-change.ts` | Recent changes (CLUBS-37), pure and client-safe: `recentChanges(appearances, name)` sets a Squad Member's last `RECENT_WINDOW` (10) filtered Appearances against every one before (the baseline) for each of `RECENT_STATS` (rating, per-90s, pass / tackle % and conversion weighted like the Outcome Split, Win % and MOTM % by Cohen's h), and reports up to `TOP_RECENT_CHANGES` each way with an effect of at least `MIN_RECENT_EFFECT` and `MIN_RECENT_APPEARANCES` a side, marking "Small sample" under `SMALL_BASELINE_APPEARANCES`. `biggest` (the largest effect either way) feeds the Squad table's Recent column; `splitRecent` is the recent-versus-baseline split anything comparing recent form reuses. Hot and Cold form (CLUBS-40): `formIndicator(appearances)` compares the last `FORM_WINDOW` (5) ratings with every one before, Hot or Cold at a gap of `HOT_COLD_GAP` (0.5) with `MIN_FORM_BASELINE` (10) before them; `squadLeaderboard` rows, `getPlayerProfile` and each Compare side carry it as `formIndicator`. `getPlayerProfile` and `squadLeaderboard` apply it after the Position Group selection. |
| `seasons.ts` | `listSeasons`: every Season the Poll has detected, oldest first. The root loader passes their numbers to every `FilterBar`. |
| `divisions.ts` | The Clubs League rules (CLUBS-41), hand-edited: `DIVISIONS` (per Division, keyed by EA's `currentDivision`, 1 = Elite to 6 = Division 5: Points Target, Promotion Series, points after a failed series, Relegation) and `LEAGUE_RULES` (Chances, points, Season start, Relegation Match resets). Every value carries its source and confidence; correct a number there and nowhere else. `toDivisionNumber`, `divisionName`. Client-safe. |
| `campaigns.ts` | Campaigns (CLUBS-41), pure: `replayCampaigns` replays League Matches from each detected Season start (Division 5, 0 points) into Campaigns with their points path, Chances, Promotion Series, Relegation Match and outcome. Playoff Matches, and League Matches after one until the next Season, are skipped. `divisionTimeline` (Season starts, Promotions, Relegations), `divisionMismatch` (the tracked Division against EA's, skipped during the Playoffs), `campaignRecord`, `chancesLeft`. Client-safe. |
| `campaigns-query.ts` | `getCampaignProgress(db)`: Seasons, every Competitive Match and the latest leaderboard Snapshot's `currentDivision`, in three parallel queries, then `campaigns.ts`. Not filtered. |
| `snapshots.ts` | `clubSnapshots`, `memberSnapshots`, `snapshotNumber`. Not filtered: they are EA's own totals. `pollState` (CLUBS-46): when the latest Poll finished and a `version` that changes only when a Poll stores new data, in two single-row reads; see "Pages that refresh themselves". |
| `ea-totals.ts` | `eaMemberTotals` (each Squad Member's latest `members/stats` and `members/career/stats` Snapshot, in one query), the pure `eaSeasonTotals` / `eaCareerTotals` that read a Snapshot into numbers, and `eaCleanSheets`. Not filtered. |
| `source.ts` | `StatsSource` (`"recorded"` or `"ea"`) and its URL format: `parseStatsSource`, `statsSourceFromRequest`, `writeStatsSource`, `STATS_SOURCE_LABEL`. |
| `comparison-params.ts` | Compare's URL format (CLUBS-20), client-safe: `parseComparisonParams` (`players=A,B`, `scope=together`, `posA` / `posB`), `writeComparisonPlayers` / `writeComparisonScope` / `writeComparisonPositionGroups`, and `comparePath`, which opens Compare from the Squad table or a profile carrying the filter and source over (the global `pos` becomes each side's). |
| `comparison.ts` | `getComparison` (Recorded: each side's totals, form and record, three parallel queries at most) and `getEaComparison` (EA season totals). The pure `compareSides` applies the scope: "Played together" narrows both sides to their Shared Matches (`sharedMatchIds`, whatever positions), then each side counts its own Position Groups; the shared record covers every Shared Match. `isSmallSample` flags figures on fewer than 3 Matches. |

Europe/London date formatting and day/hour buckets live in `~/lib/london-time` (`formatLondonDateTime` and the rest of the time-format convention in CLAUDE.md, `londonParts`, `londonDateKey`, ...).

## The filter

- URL: `?types=league,playoff&dnf=0&range=7d|30d|1y&season=2`, or `?from=2026-10-05&to=2026-10-12` for a custom range. Defaults (Competitive Matches, DNF included, all dates, all Seasons) are left out of the URL.
- Friendlies are never shown (CLUBS-32). The Poll still fetches `friendlyMatch` and stores its Raw Payloads, Matches and Appearances (ADR 0003), so nothing is lost if Our Club ever plays one, but no page, list, count or stat includes them. `MATCH_TYPES` is League and Playoff only, so `?types=friendly` is ignored like any unknown value (`?types=league,friendly` means League). `matchScope` only ever selects those types, and every query that ignores the filter (`getMatch`, `getOpponent`, `getSquadMember`, `listSquadMembers`, Session kick-offs) applies `isShownMatch`, so a Friendly's Match, an Opponent or player met only in one, are 404s. `toMatchType` throws for a Friendly, since no scoped query returns one.
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

## Pages that refresh themselves

The D1 free plan allows 5M rows read a day, and a page left open refreshing itself all evening multiplies whatever one load reads. So a self-refreshing page never reruns its loaders on a timer. It uses one mechanism, "skip the work unless the Poll changed" (CLUBS-46):

1. The loader reads `pollState(db)` first, before its other queries, and returns it.
2. The component calls `useLivePoll(loaderData.poll, intervalMs)` (`~/lib/use-live-poll`) and shows the `lastPoll` it returns in the `LastUpdatedBadge`.
3. While the tab is visible the hook fetches `/api/poll-state` every interval, and reruns the loaders only when the `version` has moved, so the badge follows every Poll but the page's data is read again only after a Poll stores something.

Matchday is the only self-refreshing page today.

### Read budget

Rows read, from `meta.rows_read` (the E2E suite measures them with the test-only meter in `app/db/rows-read.ts`, `GET /__test/rows-read`; `e2e/matchday-reads.api.spec.ts` holds the budget):

| What | Rows read |
|---|---|
| The `/api/poll-state` check, every minute while Matchday is open | 2, whatever the data (budget: 5) |
| A full Matchday load (root and page loaders) | About 330 on the recorded fixtures, growing with Our Club's Appearances (`squadForm` reads them all), not with the number of Polls |

One Matchday tab open for 6 hours costs about 720 rows for the checks, plus a full load each time a Poll stores something (in production about 1 Poll in 5). Before CLUBS-46 the page reran every loader each minute, and the latest-Poll lookup scanned every Poll run, so the same tab cost 360 full loads that grew by 2 rows with every Poll: about 170k rows on day one and over 6M, beyond the free plan, after a month.

Keep any query a page runs on a timer to an indexed lookup or a walk from the newest row (`ORDER BY id DESC LIMIT 1`), never a scan of a table that grows with every Poll.

## Adding a filter dimension

Add the field to `StatsFilter` and `DEFAULT_STATS_FILTER`, read it in `parseStatsFilter`, write it in `writeStatsFilter`, add its condition in `matchScope` (or, for a per-Appearance dimension like Position Groups, an option on the player queries), and add a control to `FilterBar` (`app/components/filter-bar.tsx`).
