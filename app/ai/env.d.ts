/**
 * Worker env the Wrangler config cannot declare (docs/adr/0006). Neither is
 * ever in the repo: the key is a Worker secret in production, and E2E runs
 * pass a dummy key and their fake upstream's URL at run time.
 */
interface Env {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
}
