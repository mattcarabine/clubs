/**
 * CLUBS-8: the site is private, so search engines must not index it.
 */
import { expect, test } from "./support/test.ts";

const NOINDEX = "noindex, nofollow";

// A page, the 404 page and a static asset: the Worker and the assets path.
for (const path of ["/", "/no-such-page", "/favicon.ico"]) {
  test(`${path} is served with X-Robots-Tag: ${NOINDEX}`, async ({
    request,
  }) => {
    const response = await request.get(path);
    expect(response.headers()["x-robots-tag"]).toBe(NOINDEX);
  });
}

test("robots.txt disallows every crawler from every path", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toBe(NOINDEX);
  const body = await response.text();
  expect(body).toMatch(/^User-agent: \*$/m);
  expect(body).toMatch(/^Disallow: \/$/m);
});
