import { describe, expect, it } from "vitest";

import { pageCount, parsePage, withPage } from "./pagination";

describe("parsePage", () => {
  it.each([
    ["", 1],
    ["page=3", 3],
    ["page=0", 1],
    ["page=-2", 1],
    ["page=2.5", 1],
    ["page=abc", 1],
  ])("reads %j as page %i", (search, page) => {
    expect(parsePage(new URLSearchParams(search))).toBe(page);
  });
});

describe("pageCount", () => {
  it("rounds up and never returns fewer than one page", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });
});

describe("withPage", () => {
  it("keeps other params and leaves page 1 out of the URL", () => {
    const params = new URLSearchParams("types=friendly&page=3");
    expect(withPage(params, 4).toString()).toBe("types=friendly&page=4");
    expect(withPage(params, 1).toString()).toBe("types=friendly");
    expect(params.toString()).toBe("types=friendly&page=3");
  });
});
