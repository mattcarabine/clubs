/**
 * Where this checkout's E2E servers listen. Each checkout (worktree) gets its
 * own ports, so parallel `pnpm test:e2e` runs in different worktrees never
 * share a server. `E2E_PORT`, `FAKE_EA_PORT`, `FAKE_ANTHROPIC_PORT` and
 * `FAKE_DISCORD_PORT` override them; otherwise all four are derived from the
 * checkout's path, so they stay the same between runs.
 */
import { createHash } from "node:crypto";
import path from "node:path";

import { WEBHOOK_PATH } from "../fake-discord/control.ts";
import { EA_PREFIX } from "../fake-ea/control.ts";

/** Derived ports fall in 20000-29999, below the OS ephemeral port ranges. */
const DERIVED_PORT_BASE = 20_000;
/** Each checkout takes four consecutive ports: the app and three fakes. */
const PORTS_PER_CHECKOUT = 4;
const DERIVED_PORT_SLOTS = 2_500;

const checkoutRoot = path.resolve(import.meta.dirname, "../..");
const checkoutHash = createHash("sha256").update(checkoutRoot).digest();

/** Identifies this checkout's fake upstreams (see their health checks). */
export const E2E_INSTANCE = checkoutHash.toString("hex").slice(0, 16);

/** The app under test (`vite preview`). */
export const APP_PORT =
  portFromEnv("E2E_PORT") ??
  DERIVED_PORT_BASE +
    PORTS_PER_CHECKOUT * (checkoutHash.readUInt32BE(0) % DERIVED_PORT_SLOTS);
/** The fake EA upstream. */
export const FAKE_EA_PORT = portFromEnv("FAKE_EA_PORT") ?? APP_PORT + 1;
/** The fake Anthropic upstream. */
export const FAKE_ANTHROPIC_PORT =
  portFromEnv("FAKE_ANTHROPIC_PORT") ?? APP_PORT + 2;
/** The fake Discord webhook. */
export const FAKE_DISCORD_PORT =
  portFromEnv("FAKE_DISCORD_PORT") ?? APP_PORT + 3;

export const APP_URL = `http://localhost:${APP_PORT}`;
export const FAKE_EA_URL = `http://localhost:${FAKE_EA_PORT}`;
/** The Worker's `EA_BASE_URL` for this run, passed in at runtime. */
export const FAKE_EA_BASE_URL = `${FAKE_EA_URL}${EA_PREFIX}`;
/** The Worker's `ANTHROPIC_BASE_URL` for this run, passed in at runtime. */
export const FAKE_ANTHROPIC_URL = `http://localhost:${FAKE_ANTHROPIC_PORT}`;
export const FAKE_DISCORD_URL = `http://localhost:${FAKE_DISCORD_PORT}`;
/** The Worker's `DISCORD_WEBHOOK_URL` for this run, passed in at runtime. */
export const FAKE_DISCORD_WEBHOOK_URL = `${FAKE_DISCORD_URL}${WEBHOOK_PATH}`;

function portFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a port number, got "${value}"`);
  }
  return port;
}
