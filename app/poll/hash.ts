/**
 * EA's relative `timeAgo` ({"number":2,"unit":"days"}) changes as time passes
 * even when nothing else does, so it is left out of the hash.
 */
const VOLATILE_FIELDS = /"timeAgo":\{[^{}]*\}/g;

/**
 * Identifies a Raw Payload's content: equal hashes mean nothing we care about
 * changed between two responses.
 */
export async function payloadHash(body: string): Promise<string> {
  const stable = body.replace(VOLATILE_FIELDS, "");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stable),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
