import { describe, expect, it } from "vitest";

import { siteUrl } from "./site";

const SITE = "https://clubs.marabine.co.uk";

describe("siteUrl", () => {
  it.each([
    ["/matches/1", `${SITE}/matches/1`],
    ["/matches/1?type=league#top", `${SITE}/matches/1?type=league#top`],
    ["", `${SITE}/`],
  ])("makes %j an absolute URL on the site", (path, expected) => {
    expect(siteUrl(path)).toBe(expected);
  });

  it.each([
    ["//evil.example/x", `${SITE}/evil.example/x`],
    ["/\\evil.example", `${SITE}/evil.example`],
    ["https://evil.example", `${SITE}/https://evil.example`],
    // The URL parser drops the tab and reads "//evil.example", so this falls
    // back to the home page.
    ["/\t/evil.example", `${SITE}/`],
  ])("keeps %j on the site's origin", (path, expected) => {
    expect(siteUrl(path)).toBe(expected);
  });
});
