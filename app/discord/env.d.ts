/**
 * Worker env the Wrangler config cannot declare (CLUBS-39). The webhook URL
 * is a Worker secret in production and never in the repo; E2E runs pass
 * their fake Discord's URL at run time. Without it, nothing is posted.
 */
interface Env {
  DISCORD_WEBHOOK_URL?: string;
}
