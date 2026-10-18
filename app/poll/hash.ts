import { sha256Hex } from "../lib/sha256.ts";

/**
 * EA's relative `timeAgo` ({"number":2,"unit":"days"}) changes as time passes
 * even when nothing else does, so it is left out of the hash.
 */
const VOLATILE_FIELDS = /"timeAgo":\{[^{}]*\}/g;

/**
 * Identifies a Raw Payload's content: equal hashes mean nothing we care about
 * changed between two responses.
 */
export function payloadHash(body: string): Promise<string> {
  return sha256Hex(body.replace(VOLATILE_FIELDS, ""));
}
