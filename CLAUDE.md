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

To trigger the cron locally: `GET /cdn-cgi/local/scheduled`. This only works in dev and preview.

## Testing (ADR 0004)
- **End-to-end tests come first.** Every acceptance criterion in a Linear issue becomes a Playwright spec in `e2e/`.
- **EA is never called in tests or CI.** Tests run against the fake EA upstream, which replays recorded Raw Payloads from `fixtures/ea/`.
- **Unit tests** (`*.test.ts` next to the code) cover only parsers and stat formulas.
- **CI must be green before merging:** typecheck, lint, unit and E2E. Git hooks (simple-git-hooks, installed by `pnpm install`) run Biome and typecheck on commit, plus lint and unit tests on push. Never bypass them with `--no-verify`; after merging `main` into a branch, re-run `pnpm typecheck` before pushing.
- **Harness:** import `test`/`expect` from `e2e/support/test.ts`. Each test starts with empty D1 tables and a reset fake EA. Fixtures: `triggerPoll()` runs the real scheduled handler; `fakeEa.addMatch(win())` (builders `win`/`loss`/`draw`/`dnf`/`friendly` in `e2e/support/match-builders.ts`), `fakeEa.setPayload(endpoint, body)`, `fakeEa.failNext(403)`, `fakeEa.timeoutNext()`, `fakeEa.requests()`; `db.rows(table)` reads a table through the test-only `/__test/*` routes.
- Data-only specs are named `*.api.spec.ts` and run once (project `api`); page specs run on `mobile` and `desktop`.
- `app/ea/` and `app/poll/` must also run under Node (ADR 0005): relative imports there use `.ts` extensions, and no Worker-only APIs outside `app/poll/record.ts` and `app/poll/run.ts`.

## Conventions
- Stat formulas and queries live in the shared `app/stats/` layer. Pages never write their own SQL or repeat a formula.
- **Two-places rule:** anything used twice goes in a shared module (`app/components/`, `app/stats/`, `app/lib/`).
- Display times in Europe/London.
- Every page must work at 375px wide with no horizontal page scroll, and use the extra width on desktop.

## Workflow
- One branch and one PR per Linear issue. Name the branch with the issue's `gitBranchName`, and put the issue ID (e.g. `CLUBS-9`) in the PR title.
- Before opening a PR: run the code-simplifier agent and then the code-reviewer agent over the diff.
- The orchestrator merges a PR once CI is green. Workers Builds then deploys `main`.

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
- The crest (`assets/crest-96.png`, a copy of `assets/crest.png`) appears only as the favicon (`public/favicon.ico` and a `<link rel="icon">`) and in the header lockup, at 36px.
- Motion is limited to the Ticker scroll and the loading shimmer, and both stop under `prefers-reduced-motion`.

### Components (`import { … } from "~/components"`)
Every component is presentational: it takes props and never fetches. Shared domain types (`Outcome`, `PositionGroup`, `MatchType`) live in `~/lib/domain`.
- `AppShell`: header with crest lockup and nav (Matchday, Squad, Matches, Opponents, Trends), optional `ticker` slot. `root.tsx` already wraps every route in it.
- `PageHeader` / `SectionHeading`: the page's single h1 (with an optional `aside`, e.g. a badge) and section h2s.
- `ScoreBar`: the broadcast score strip. Use `size="hero"` for the lead Match and `compact` in lists; mark Our Club with `isOurClub`.
- `Ticker`: a scrolling strip of `{ id, headline, detail }` items, made for the `AppShell` `ticker` slot.
- `StatTile` inside `StatGrid`: a headline number with an optional delta (`tone` is whether the change is good for us) and a sparkline trend. Use `featured` on one tile at most.
- `DataTable`: sortable via `sortValue`. The first column is the sticky row header; the table scrolls inside its own container on phones.
- `FormGuide`: W/D/L run, oldest first. `OutcomeBadge` is one block.
- `PlayerChip`: a Squad Member's initials, name, Position Group and optional stat; `former` for Former Squad Members, `to` to link.
- `LastUpdatedBadge`: "Updated 4 min ago" from the latest Poll; it turns amber and says "Stale" after 15 minutes (three missed Polls).
- `EmptyState`: says what is missing and what will fill it.
- `Skeleton` / `LoadingState`: placeholders; `LoadingState` announces loading once.
- Charts: `ChartFrame` (titled panel) and `ChartLegend`, with `LineChart`, `BarChart` and `Sparkline`.

### Charts
One approach on every page: **hand-rolled SVG and HTML in `app/components/charts/`, with no chart library**. That keeps the Worker bundle small and renders on the server. Follow the dataviz skill's rules:
- Series colours come from `SERIES_COLORS` in fixed order and are never cycled. Four series at most; past that, fold the rest into "Other" or use small multiples. The order was checked with the dataviz CVD validator against `shale-900`.
- Use a single y-axis and never dual axes. Lines are 2px, markers 8px with a 2px surface ring, bars at most 16px thick, gridlines 1px `shale-700`.
- Charts with two or more series get a `ChartLegend`. Text uses ink tokens, never the series colour.
- `LineChart` has a snapping crosshair and tooltip (pointer, touch, and arrow keys as a slider) plus a screen-reader data table. `BarChart` labels every bar, so it has no tooltip. Use horizontal bars for rankings, because they fit phones.
- Charts measure their container (`useElementWidth`), so they fit any width without scaling text.

### Do
- Design at 375px first, then use the width at 1440px (`lg:grid-cols-2`, four-up `StatGrid`).
- Put wide content in its own scroll container (`DataTable` already does). The page itself must never scroll sideways.
- Keep the copy in sentence case, using CONTEXT.md terms ("Squad Member", "Match").

### Don't
- Add hex values or Tailwind default colours in components; add a token instead.
- Use colour alone for meaning. Outcomes carry letters and stale data carries the word "Stale".
- Add a chart library, a second display font, gradients or drop shadows on cards.
- Use Sounders or Sky marks, logos or exact colour schemes.
