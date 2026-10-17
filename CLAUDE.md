# A Bloo Bloo Stats: agent guide

Read before changing anything:
- [CONTEXT.md](CONTEXT.md) is the domain glossary. Use its terms exactly (Match, Appearance, Squad Member, Poll, Snapshot, Raw Payload, Season, ...) in code, UI copy and tests.
- [docs/adr/](docs/adr) holds decisions that are hard to reverse. Do not contradict one without writing a new ADR.
- Linear (team **CLUBS**, project "v1 — A Bloo Bloo Stats") is the source of truth for work. Each issue's acceptance criteria are end-to-end scenarios.

## Stack
- Cloudflare Workers on the **free plan**: watch CPU per request, D1 reads and writes, and subrequests.
- React Router v8 in framework mode (SSR) through `@cloudflare/vite-plugin`.
- Read bindings in loaders with `import { env } from "cloudflare:workers"`.
- D1 binding `DB`, accessed through Drizzle (`app/db/`). Edit `app/db/schema.ts`, run `pnpm db:generate` to write a migration to `migrations/`, then apply it with `pnpm db:migrate:local` (or `:remote`). Never hand-edit generated migrations.
- D1 caps bound parameters at 100 per statement and the free plan caps queries at 50 per invocation: write many rows with `bulkInsert` (`app/db/bulk.ts`), and batch writes with `db.batch`.
- The Poll stores a Raw Payload only when its hash changes, and derives Matches, Appearances, clubs, players and Snapshots from it in the same batch (`app/poll/record.ts`, `app/poll/ingest.ts`). Parsing EA's strings lives in `app/ea/parse.ts`. The Poll also records each new Season in `seasons` when the current-season leaderboard's `gamesPlayed` drops (`app/poll/seasons.ts`), and both clubs' Skill Ratings on each Match: within an hour of a new Match, or backfilled a few Opponents per Poll for older ones (`app/poll/rating-targets.ts`, `app/poll/ratings.ts`). EA's `clubs/overallStats` batches clubs only as a repeated `clubIds` parameter; comma-separated IDs get a 400.
- The Worker entry point, `workers/app.ts`, has the `fetch` handler (React Router) and the `scheduled` handler (the Poll).
- Tailwind v4.
- Biome handles lint and format; 2-space indent, double quotes.

## Commands
| Command | Purpose |
|---|---|
| `pnpm dev` | Local dev server |
| `pnpm typecheck` | Regenerates the Wrangler and route types, then runs `tsc` |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm test` | Vitest unit tests (pure logic only) |
| `pnpm test:e2e` | Playwright against the production build in workerd (`test` Wrangler env, fresh D1 in `.wrangler/e2e`) and the fake EA upstream |
| `pnpm fixtures:record` | Re-record `fixtures/ea/` from live EA (never in CI) |
| `pnpm test:live` | Smoke tests in `live/` (never in CI): every Poll request to live EA still has the fields we read (`app/ea/shape.ts`), and production serves Matchday with a Poll under 15 minutes old. `LIVE_SITE_URL` overrides the site |

To trigger the cron locally: `GET /cdn-cgi/local/scheduled`. This only works in dev and preview.

## Testing (ADR 0004)
- **End-to-end tests come first.** Every acceptance criterion in a Linear issue becomes a Playwright spec in `e2e/`.
- **EA is never called in tests or CI.** Tests run against the fake EA upstream, which replays recorded Raw Payloads from `fixtures/ea/`.
- **Unit tests** (`*.test.ts` next to the code) cover only parsers and stat formulas.
- **CI must be green before merging:** typecheck, lint, unit and E2E. Git hooks (simple-git-hooks, installed by `pnpm install`) run on commit: a secret scan (secretlint; the repo is public), Biome, a migration drift check when `app/db/schema.ts` changes, and typecheck. On push they run lint and unit tests. Never bypass them with `--no-verify`; after merging `main` into a branch, re-run `pnpm typecheck` before pushing.
- **Harness:** import `test`/`expect` from `e2e/support/test.ts`. Each test starts with empty D1 tables and a reset fake EA. Fixtures: `triggerPoll()` runs the real scheduled handler; `fakeEa.addMatch(win())` (builders `win`/`loss`/`draw`/`dnf`/`friendly` in `e2e/support/match-builders.ts`), `fakeEa.setPayload(endpoint, body)`, `fakeEa.failNext(403)`, `fakeEa.timeoutNext()`, `fakeEa.requests()`; `db.rows(table)` reads a table through the test-only `/__test/*` routes.
- **Ports are per checkout**, so worktrees can run `pnpm test:e2e` at the same time. `e2e/support/ports.ts` derives a stable app port and fake EA port (in 20000-29999) from the checkout's path; `E2E_PORT` and `FAKE_EA_PORT` override them. The `test` Wrangler env has no `EA_BASE_URL`: Playwright passes this run's fake EA URL to `vite preview` (via `CLOUDFLARE_INCLUDE_PROCESS_ENV`, so a `.dev.vars` file would block it). Locally an already-running server is reused only when its health check (`/__test/health?ea=…`, `/__control/health?instance=…`) proves it is this checkout's; another worktree's answers 409 and the run fails rather than sharing it. Never import ports or URLs from anywhere but `ports.ts`.
- Data-only specs are named `*.api.spec.ts` and run once (project `api`); page specs run on `mobile` and `desktop`.
- `app/ea/` and `app/poll/` must also run under Node (ADR 0005): relative imports there use `.ts` extensions, and no Worker-only APIs outside `app/poll/record.ts` and `app/poll/run.ts`.

## Conventions
- Stat formulas and queries live in the shared `app/stats/` layer. Pages never write their own SQL or repeat a formula. Read [app/stats/README.md](app/stats/README.md) before building a page or adding a query. Every stats page parses a `StatsFilter` in its loader and mounts `FilterBar`.
- **Two-places rule:** anything used twice goes in a shared module (`app/components/`, `app/stats/`, `app/lib/`).
- Display times in Europe/London, through `~/lib/london-time`, in one convention (CLUBS-22):

  | Kind | Example | Use | Helper |
  |---|---|---|---|
  | Day | `Wed 14 Oct` | A date on its own: Last met, Tracking since, "as of", Matches day headings | `formatLondonDate` / `<LondonTime format="day">` |
  | Moment | `Wed 14 Oct, 22:54` | When a Match was played, wherever it is listed or titled | `formatLondonDateTime` / `<LondonTime format="moment">` |
  | Time | `22:54` | Only under a heading that already names the day | `formatLondonTime` / `<LondonTime format="time">` |
  | Short date | `14 Oct` | Only where space is tightest: chart axis labels and the FilterBar's custom date-range chip | `formatLondonShortDate` |
  | Relative | `4 min ago` | Only how old our data is (`LastUpdatedBadge`), never when a Match was played | `formatRelativeTime` |

  Days and moments add the year only outside the current London year (`Tue 14 Oct 2025`). The clock is 24-hour. Render dates with `<LondonTime>` so they are a `<time dateTime>`.
- **Date filtering (CLUBS-21):** every date filter goes through the shared `StatsFilter` / FilterBar date range, never a page-specific control.
  - **Options:** "All" (the default), the presets Last 7 days, Last 30 days and Last year, and a custom from/to picker.
  - **Boundaries:** dates are Europe/London calendar days, inclusive at both ends.
  - **URL:** presets serialise as `?range=7d|30d|1y`, so shared links stay relative; custom ranges as `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
  - **Bad input:** an invalid range falls back to "All".
- Every page must work at 375px wide with no horizontal page scroll, and use the extra width on desktop.

## Workflow
- One branch and one PR per Linear issue. Name the branch with the issue's `gitBranchName`, and put the issue ID (e.g. `CLUBS-9`) in the PR title.
- Before opening a PR: run the code-simplifier agent and then the code-reviewer agent over the diff.
- The orchestrator merges a PR once CI is green. Workers Builds then deploys `main`.

## Production
- The Worker serves https://clubs.marabine.co.uk, declared as a custom domain in `routes` in `wrangler.jsonc`. Keep it there: a deploy without it would detach the domain.
- Workers Builds runs `pnpm run deploy` on every push to `main`: build, then `wrangler d1 migrations apply DB --remote`, then `wrangler deploy`.
- **Migrations must be backward compatible.** They reach production D1 before the new code does, so the code that is still live (including its 5-minute Poll) must keep working against the migrated schema. Add columns as nullable or with defaults, and add tables freely. To rename or drop something, first ship code that no longer uses it, then remove it in a later PR.
- The site is private and never indexed: every Worker response gets `X-Robots-Tag: noindex, nofollow` (`workers/app.ts`), static assets get it from `public/_headers`, and `public/robots.txt` disallows everything.

## Visual design
A TV sports-broadcast look: angled score bars, ticker strips and bold condensed numerals on blue-slate surfaces. The palette is inspired by the Seattle Sounders but uses none of their marks, and nothing is copied from Sky Sports or any other broadcaster. Dark is the only theme. See every component live at `/styleguide`.

### Tokens (`app/app.css`, Tailwind v4 `@theme static`)
The default Tailwind colours are switched off, so only these exist (`bg-shale-900`, `text-ink-soft`, `var(--color-rave)` and so on).

| Token | Hex | Use |
|---|---|---|
| `shale-950` | `#0d1721` | Page background |
| `shale-900` | `#14212d` | Panels, tables, chart surface |
| `shale-800` | `#1c2d3c` | Raised: table header, hover, opponent panel |
| `shale-700` / `shale-600` | `#2a3f52` / `#3a5268` | Hairlines, gridlines / axis baseline |
| `ink` / `ink-soft` / `ink-muted` | `#eef3f6` / `#c3cdd5` / `#8fa1b0` | Primary, secondary, label text |
| `rave` | `#7ac943` | The club green: active nav, tabs, wins, focus ring. Text on it is `shale-950` |
| `sound-900` / `sound-700` / `sound-300` | `#0f3f7a` / `#1f5aa6` / `#74b3f2` | Our Club's panels / chips / links |
| `win` / `draw` / `loss` | `#7ac943` / `#8fa1b0` / `#ef5b5b` | Outcomes, always paired with the W/D/L letter |
| `stale` | `#f2b33d` | Stale data warning only |
| `series-1..4` | `#5aac33` `#3d8be0` `#c95fa0` `#d46e22` | Chart series in this fixed order |

Text contrast (WCAG AA): `ink-muted` is 6.1:1 on `shale-900` and 5.3:1 on `shale-800`; `loss` text is 4.9:1 on `shale-900`, so use it only on `shale-900` or darker. Other tokens: `--slant` (the angle offset), `text-score` / `text-score-lg` (scoreboard numerals), `animate-ticker`, `animate-shimmer`. Utilities: `clip-slant`, `clip-slant-l`, `clip-slant-r` (angled edges; set `[--slant:…]` to change the angle) and `tabular` (aligned figures). Spacing uses Tailwind's default 4px scale.

### Fonts
From Google Fonts, loaded in `app/root.tsx`. **Sofia Sans Extra Condensed** (`font-display`, weights 600 to 800, 800 italic) is for numerals, team names, nav, headings and table headers, set in uppercase like broadcast graphics. **Sofia Sans** (`font-sans`, 400 to 700) is for running text, labels and table cells. Use `tabular` only where numbers line up in a column.

### Motifs
- Angled edges (`clip-slant*`) on score panels, tabs, badges and chips. Cards and tables keep square corners with a 2px top rule.
- A green slanted tab labels a strip (the ScoreBar's Match Type, the Ticker's "Latest").
- Our Club is always deep blue (`sound-900`); Opponents are `shale-800`.
- Compare's tale of the tape puts Squad Member A on the left on deep blue (`sound-900` plate, `sound-300` share bars) and B on the right on `rave` (text `shale-950`). Each stat's label is centred; the leader's figure is bold with a rave pointer and "(leads)" for screen readers.
- The crest appears only as the favicon (`assets/crest-96.png`, the whole crest, via `public/favicon.ico` and a `<link rel="icon">`), in the header lockup and in Our Club's panel on the hero `ScoreBar`. Both of those use `CrestMark`: `assets/crest-mark.png`, the crest cropped to the face (the only part that reads that small), at 40px on a green slanted tab. Opponents never get an image: the hero gives them a two-letter monogram (`monogram` from `~/lib/monogram`) on a slanted `shale-700` badge.
- Panels in a strip are cut apart by 4px slanted seams of page background, so the slants run parallel (the `ScoreBar`).
- A result shows as a word as well as a colour: the hero's outcome tab ("Win", "DNF loss") on an outcome-coloured rule along the foot of the score, or a W/D/L `OutcomeBadge` beside the score in compact rows. `OUTCOME_FILL` holds each outcome's fill and text colour.
- A sideways scroller that clips content fades it out at that edge (`useScrollFade` from `~/lib/use-scroll-fade` plus the `scroll-fade` utility), so it reads as "scrolls" rather than "cut off". It is a mask, not a colour gradient. `FilterBar` and `DataTable` have it; a table fades only its end, so the pinned column stays crisp.
- Rows that link somewhere read as rows, not as blue link text: pass `rowHref` to `DataTable` (or use `useRowLink` and the `LINKED_ROW*` classes from `~/components` in a hand-built table). The row header holds the link in ink, the whole row is clickable, and hover lights the header's left edge in rave. Blue `sound-300` text is for links in running copy only.
- Motion is limited to the Ticker scroll and the loading shimmer, and both stop under `prefers-reduced-motion`.

### Components (`import { … } from "~/components"`)
Every component is presentational: it takes props and never fetches. Shared domain types (`Outcome`, `PositionGroup`, `MatchType`) live in `~/lib/domain`.
- `AppShell`: header with crest lockup and nav (Matchday, Squad, Matches, Opponents, Trends, Analysis), optional `ticker` slot. The six items fit a 375px phone without scrolling the nav (`px-1.5` links with normal tracking under `sm`); check that again before adding a seventh. `root.tsx` already wraps every route in it.
- `PageHeader` / `SectionHeading`: the page's single h1 (with an optional `aside`, e.g. a badge) and section h2s.
- `ScoreBar`: the broadcast score strip, on a `shale-800` score block with a slanted divider between the numerals. Use `size="hero"` for the lead Match and `compact` in lists; mark Our Club with `isOurClub`. The hero is capped at `HERO_WIDTH` (60rem) and centred; each side's mark, name and `detail` line (e.g. its Skill Rating) sit centred in its panel, short names set larger so they fill it, long ones wrapping to two lines and then clamping (the full name is the panel's `title`). Above it, `label` and `meta` form one slanted tab cluster (`PLAYOFF | FULL TIME | Sat 17 Oct, 22:49`); below it, `stats` is a three-figure strip (ours left, theirs right) that stacks label-over-values on phones. Both names are `ink`: the panel colour alone tells the sides apart. Use `MatchScoreBar` for a Match: it fills the cluster, the Skill Ratings and the strip (Shots, Pass %, Tackles, from `summariseMatchSides`, hidden unless both clubs have Appearances).
- `Ticker`: a strip of slanted `shale-800` chips (`{ id, headline, detail, badge }`), made for the `AppShell` `ticker` slot. It scrolls only when the items overflow it, and sits still when they fit; `fit` shrinks it to its items and centres it, so a short list never leaves an empty bar. `TopPerformersStrip` is the Ticker under a hero: one chip per performer with a `sound-700` rating pill.
- `StatTile` inside `StatGrid`: a headline number with an optional delta (`tone` is whether the change is good for us) and a sparkline trend. Use `featured` on one tile at most.
- `DataTable`: sortable via `sortValue`; `highlight` picks rows out in `sound-900` with a `rave` edge (say why in the row too). The first column is the sticky row header; the table scrolls inside its own container on phones, with its end faded. `rowHref` makes rows links; `select` puts a tick box in each row header (the Squad table's Compare picks). On phones the pinned header may wrap to two lines so it never widens the pinned column; order columns so the ones people compare come first (the Squad table leads with G+A, Rating, Form and Apps, which fit beside the name at 375px).
- `FormGuide`: W/D/L run, oldest first. `OutcomeBadge` is one block.
- `HeadToHeadBar`: Our Club and an Opponent either side of won/drawn/lost blocks, over a meter of their share. Use `size="hero"` for the lead strip; on phones the blocks drop below the names.
- `PlayerChip`: a Squad Member's initials, name, Position Group and optional stat; `former` for Former Squad Members, `to` to link, `dense` to show just the name on phones (for a pinned table column).
- `LastUpdatedBadge`: "Updated 4 min ago" from the latest Poll; it turns amber and says "Stale" after 15 minutes (three missed Polls).
- `EmptyState`: says what is missing and what will fill it. Sparse data is the norm, so hide a summary that would be meaningless (e.g. "Most played" when every Opponent was met once, a one-point chart, a By Position Group table with one group) rather than showing it, and don't leave half a row empty: a sparse panel takes its own full-width row instead of sitting beside a chart (Trends' one-reading skill rating), and a short side column beside a long one is `lg:sticky lg:top-24 lg:self-start`.
- `BackLink` / `RouteError`: a detail page's "‹ All Matches" link, and its `ErrorBoundary` (back link plus a 404 or failed-to-load `EmptyState`). Every `:id` route has one; the root boundary handles unknown addresses.
- `ScrollRail`: a row of chip groups that scrolls sideways on phones with a fading edge, wrapping from `sm` up (inside the FilterBar, and Compare's per-player Position Group pickers).
- `FilterBar`: the global stats filter (Match Type, DNF, dates, Season) as slanted toggle chips (`Chip` / `chipClassName` in `app/components/chip.tsx`); it rewrites the URL so the loader reruns. Its "Custom" date chip opens a "Custom dates" strip under the chip rail, never inside it, so a phone cannot scroll it away: two native date fields styled as chips (`[color-scheme:dark]`, 16px text so iOS does not zoom) with Apply / Cancel. An applied range shows on the chip as "5 Oct – 12 Oct". Pass `source` (from `statsSourceFromRequest`) to lead with the Recorded / EA totals toggle (`?source=ea`); on EA totals it hides the Match filters and says why. Pass `positions` on player-level pages (Squad, profile) to show the Position Group selection (`?pos=`); on EA totals it stays visible but disabled, with a tooltip. On phones it is one row that scrolls sideways, so it never takes a screenful.
- `PositionGroupPicker`: the Position Group multi-select (All Positions plus EA's four names), presentational with `value` / `onChange`, so the FilterBar uses it for `?pos=` and Compare can show one per player. `disabledReason` (e.g. `EA_POSITIONS_DISABLED`) disables it with a tooltip. `ChipGroup` is the labelled chip row both use.
- `Skeleton` / `LoadingState`: placeholders; `LoadingState` announces loading once.
- Charts: `ChartFrame` (titled panel) and `ChartLegend`, with `LineChart`, `StackedColumnChart`, `BarChart`, `WinRateBarChart` (Win % by bucket on a fixed 0 to 100 scale, "label (played)"; Trends and Analysis) and `Sparkline`.
- Analysis findings (`app/routes/analysis/findings.tsx`): a numbered rundown in `shale-900` cards with an italic display numeral; the lead finding spans the row in `sound-900` with a `rave` top rule. Each card carries a slanted factor chip, a "Small sample" chip in words (never colour alone, never `stale`) and its Match counts.

### Charts
One approach on every page: **hand-rolled SVG and HTML in `app/components/charts/`, with no chart library**. That keeps the Worker bundle small and renders on the server. Follow the dataviz skill's rules:
- Series colours come from `SERIES_COLORS` in fixed order and are never cycled. Four series at most; past that, fold the rest into "Other" or use small multiples. The order was checked with the dataviz CVD validator against `shale-900`.
- Use a single y-axis and never dual axes. Lines are 2px, markers 8px with a 2px surface ring, bars at most 16px thick, gridlines 1px `shale-700`.
- Charts with two or more series get a `ChartLegend`. Text uses ink tokens, never the series colour.
- A series takes its place's colour unless it sets `color` (a `SERIES_COLORS` entry) to pair series up: Compare draws Squad Member A in series-2 blue and B in series-1 green, each 5-Match average `dashed`. Legend entries take the same `color` / `dashed`.
- `LineChart` takes an optional `reference` level (a 1px dashed `ink-muted` line labelled at the left, e.g. 50% on a Win % chart), which the y-axis always includes.
- `LineChart` has a snapping crosshair and tooltip (pointer, touch, and arrow keys as a slider) plus a screen-reader data table. `BarChart` labels every bar, so it has no tooltip. Use horizontal bars for rankings, because they fit phones.
- Category x-axes (`LineChart`, `StackedColumnChart`) pick labels with `axisLabelIndices`: a run of equal labels (several Matches on one date) is labelled once, and labels never crowd each other or the last one. The y-axis gutter grows to fit its tick labels; pass `integerTicks` for values that are never fractional.
- Format numbers with `~/lib/number-format` (`formatDecimal`, `formatPercentage`, `formatOptional`, `NO_VALUE`), never a local `toFixed`.
- Charts measure their container (`useElementWidth`), so they fit any width without scaling text.

### Do
- Design at 375px first, then use the width at 1440px (`lg:grid-cols-2`, four-up `StatGrid`). On a phone a page's main content (e.g. the Squad table) starts on the first screen: summary tiles above it go compact below `sm`.
- Put wide content in its own scroll container (`DataTable` already does). The page itself must never scroll sideways.
- Keep the copy in sentence case, using CONTEXT.md terms ("Squad Member", "Match").

### Don't
- Add hex values or Tailwind default colours in components; add a token instead.
- Use colour alone for meaning. Outcomes carry letters and stale data carries the word "Stale".
- Add a chart library, a second display font, gradients or drop shadows on cards.
- Use Sounders or Sky marks, logos or exact colour schemes.
