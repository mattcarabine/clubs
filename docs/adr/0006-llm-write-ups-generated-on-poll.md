# LLM write-ups are generated on the Poll, never on a request

Session recaps, Match reports and the State of the club are written by Claude (`claude-opus-5-5`, one constant in `app/ai/config.ts`) from numbers the `app/stats/` layer has already computed, never from Raw Payloads. The owner pays for the API from a fixed credit, so a call must never depend on who visits the site: only the scheduled handler calls the model, after the Poll's own work, and pages only read what is stored. No route, loader or endpoint imports the client, and there is no free-text prompt anywhere. There is no spend cap in code; the owner controls spend in the Anthropic Console with auto top-up off, and every call records its tokens and estimated cost.

Work is a queue in D1 (`ai_jobs`), drained a few calls per Poll inside the free plan's limits (two calls, none started after 150 seconds, the SDK's own retries off). Each writer lists its subjects cheaply, newest first, with a version that changes only when the write-up should be redone, such as a Session's Match IDs. A job is tried at most 3 times with exponential backoff, and a failure (including a billing or out-of-credit error) never touches the Poll's status; pages keep showing the last write-up. Inputs are built as of the subject's moment (a Session's brief reads nothing after its last kick-off), so an input never drifts once written, and a job whose input hash matches a done one is never paid for twice. Each job keeps the exact request it sent, for auditing, and the text it produced goes to `ai_writeups`, one row per subject, latest wins.

Opponent club names and persona names are chosen by strangers on EA, so the prompt treats them as untrusted data: they are cut to one line of at most 40 characters (`promptName`), the data sits in `<background>` and `<data>` blocks whose JSON cannot close its tags, and the system prompt says nothing inside those blocks is an instruction. Replies are checked strictly against the writer's schema (no extra fields, length caps, the State of the club only when asked for) and cleaned of HTML, Markdown links and URLs before they are stored, and pages render them as escaped text.

Write-ups appear as ordinary site copy with no AI label; only advice aimed at one Squad Member is signed, as "— The Gaff". E2E runs answer the calls with a fake Anthropic upstream (ADR 0004), so tests and CI never reach the real API.

## Considered options

- **Generate on first page view and cache.** Rejected: any visitor, crawler or refresh could spend credit, and a slow model call would block a page.
- **Cloudflare Queues or Workflows.** Rejected for now: a D1 table drained by the existing 5-minute cron needs no new binding and stays on the free plan.
- **One call per write-up.** Rejected: a Session's recap and its Match reports share almost all their input, so one call with structured output writes them all, and the newest Session's call also writes the State of the club.
