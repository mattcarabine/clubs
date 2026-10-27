import { describe, expect, it } from "vitest";

import { CREST_BASE, crestUrl } from "./crest.ts";

describe("crestUrl", () => {
  it("builds the CDN URL for an asset ID", () => {
    expect(crestUrl("99161008")).toBe(`${CREST_BASE}99161008.png`);
  });

  it.each([null, undefined, "", "../x"])("is null for %s", (id) => {
    expect(crestUrl(id)).toBeNull();
  });
});
