#!/bin/sh
# `pnpm dev:ai`: local dev that also writes Session recaps (docs/adr/0006).
#
# Plain `pnpm dev` has no ANTHROPIC_API_KEY, so its Polls skip write-ups.
# This opts in by reading the key from the environment or from `.ai.env`
# (git-ignored; one line, ANTHROPIC_API_KEY=...). A `.dev.vars` file would do
# the same but must never exist: it stops the E2E suite passing its fake
# upstreams' URLs in through CLOUDFLARE_INCLUDE_PROCESS_ENV.
#
# Every Poll you trigger (GET /cdn-cgi/local/scheduled) may then spend real
# credit on the real API.
set -e

if [ -f .ai.env ]; then
  set -a
  . ./.ai.env
  set +a
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "dev:ai needs ANTHROPIC_API_KEY, in the environment or in .ai.env" >&2
  exit 1
fi

CLOUDFLARE_INCLUDE_PROCESS_ENV=true exec pnpm exec react-router dev "$@"
