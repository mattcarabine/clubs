/**
 * Where this checkout's E2E servers listen. Each checkout (worktree) gets its
 * own ports, so parallel `pnpm test:e2e` runs in different worktrees never
 * share a server. `E2E_PORT`, `FAKE_EA_PORT` and `FAKE_ANTHROPIC_PORT`
 * override them; otherwise all three are derived from the checkout's path,
 * so they stay the same between runs.
 */
import { createHash } from "node:crypto";
import path from "node:path";

import { EA_PREFIX } from "../fake-ea/control.ts";

/** Derived ports fall in 20000-29999, below the OS ephemeral port ranges. */
const DERIVED_PORT_BASE = 20_000;
/** Each checkout takes three consecutive ports: the app and two fakes. */
const PORTS_PER_CHECKOUT = 3;
const DERIVED_PORT_SLOTS = 3_333;

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

export const APP_URL = `http://localhost:${APP_PORT}`;
export const FAKE_EA_URL = `http://localhost:${FAKE_EA_PORT}`;
/** The Worker's `EA_BASE_URL` for this run, passed in at runtime. */
export const FAKE_EA_BASE_URL = `${FAKE_EA_URL}${EA_PREFIX}`;
/** The Worker's `ANTHROPIC_BASE_URL` for this run, passed in at runtime. */
export const FAKE_ANTHROPIC_URL = `http://localhost:${FAKE_ANTHROPIC_PORT}`;

function portFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a port number, got "${value}"`);
  }
  return port;
}
