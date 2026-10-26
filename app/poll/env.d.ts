/**
 * Worker env the Wrangler config cannot declare (docs/adr/0007). The relay's
 * token is a Worker secret in production and never in the repo; E2E runs
 * pass a dummy one at run time. Without it, the relay routes answer 404.
 */
interface Env {
  RELAY_TOKEN?: string;
}
