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
- **CI must be green before merging:** typecheck, lint, unit and E2E.
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
_To be defined by CLUBS-5 (design system)._
