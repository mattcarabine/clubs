#!/bin/sh
# Git pre-commit checks; installed by simple-git-hooks (see package.json).
set -e

staged=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$staged" ] && exit 0

# The repo is public: block credentials before they reach history.
echo "$staged" | xargs pnpm exec secretlint --maskSecrets

pnpm exec biome check --staged --no-errors-on-unmatched

# Schema changes must ship with their generated migration.
if echo "$staged" | grep -q '^app/db/schema.ts$'; then
  pnpm exec drizzle-kit generate >/dev/null
  # Only unstaged or untracked changes count: a staged migration is the match.
  if ! git diff --quiet -- migrations ||
    [ -n "$(git ls-files --others --exclude-standard -- migrations)" ]; then
    echo "app/db/schema.ts changed without a matching migration; one was generated in migrations/. Review and stage it." >&2
    exit 1
  fi
fi

pnpm typecheck
