/**
 * CLUBS-8: the site is private, so search engines must not index it.
 */
import { expect, test } from "./support/test.ts";

const NOINDEX = "noindex, nofollow";

// A page, the 404 page and a static asset: the Worker and the assets path.
for (const path of ["/", "/no-such-page", "/favicon.ico", "/og-card.png"]) {
  test(`${path} is served with X-Robots-Tag: ${NOINDEX}`, async ({
    request,
  }) => {
    const response = await request.get(path);
    expect(response.headers()["x-robots-tag"]).toBe(NOINDEX);
  });
}

/** robots.txt's rules for each user agent, by RFC 9309 group. */
function robotsGroups(body: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let agents: string[] = [];
  let inRules = false;
  for (const raw of body.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (field.toLowerCase() === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value);
      groups.set(value, []);
    } else {
      inRules = true;
      for (const agent of agents) groups.get(agent)?.push(`${field}: ${value}`);
    }
  }
  return groups;
}

// CLUBS-38: link-preview bots may read pages so shared links unfurl.
const PREVIEW_AGENTS = [
  "Discordbot",
  "WhatsApp",
  "facebookexternalhit",
  "Twitterbot",
  "Slackbot",
  "TelegramBot",
];

test("robots.txt allows only the link-preview bots and disallows every other crawler", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-robots-tag"]).toBe(NOINDEX);
  const groups = robotsGroups(await response.text());
  expect(groups.get("*")).toEqual(["Disallow: /"]);
  for (const agent of PREVIEW_AGENTS) {
    expect(groups.get(agent), agent).toEqual(["Allow: /"]);
  }
  expect([...groups.keys()].sort()).toEqual(["*", ...PREVIEW_AGENTS].sort());
});
