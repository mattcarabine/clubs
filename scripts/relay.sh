#!/bin/sh
# `pnpm relay`: the home relay (docs/adr/0007), polling EA through Chrome and
# pushing each Poll to the Worker. Reads RELAY_TOKEN from the environment or
# from `.relay.env` (git-ignored; one line, RELAY_TOKEN=...), which must match
# the Worker's RELAY_TOKEN secret.
set -e
cd "$(dirname "$0")/.."

if [ -f .relay.env ]; then
  set -a
  . ./.relay.env
  set +a
fi

exec node scripts/relay.ts "$@"
