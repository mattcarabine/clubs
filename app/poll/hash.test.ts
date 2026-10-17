import { describe, expect, it } from "vitest";

import { payloadHash } from "./hash.ts";

describe("payloadHash", () => {
  it("ignores EA's relative timeAgo, which changes without new data", async () => {
    const earlier = '[{"matchId":"1","timeAgo":{"number":5,"unit":"minutes"}}]';
    const later = '[{"matchId":"1","timeAgo":{"number":2,"unit":"hours"}}]';
    expect(await payloadHash(earlier)).toBe(await payloadHash(later));
  });

  it("changes when anything else changes", async () => {
    expect(await payloadHash('{"goals":"1"}')).not.toBe(
      await payloadHash('{"goals":"2"}'),
    );
  });

  it("is a hex SHA-256", async () => {
    expect(await payloadHash("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
