/**
 * CLUBS-38: shared links unfurl into a card in Discord, WhatsApp and the
 * like, from Open Graph tags in every page's head, while nothing is indexed.
 */

import type { APIRequestContext } from "@playwright/test";
import {
  formatLondonDate,
  formatLondonDateTime,
} from "../app/lib/london-time.ts";
import { OG_IMAGE_PATH, SITE_URL, THEME_COLOR } from "../app/lib/site.ts";

import type { AddMatchBody } from "./fake-ea/control.ts";
import {
  loss,
  OUR_CLUB_ID,
  win,
  withLineup,
} from "./support/match-builders.ts";
import { expect, test } from "./support/test.ts";

const MINUTE_MS = 60_000;
const DISCORDBOT =
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)";
const CARD_URL = `${SITE_URL}/${OG_IMAGE_PATH}`;

const KAB = { id: "938000001", name: "Kabeeble" };
const TREV = { id: "938000002", name: "Trevor" };

/** In every Match Kabeeble scores twice and is Man of the Match; Trevor just plays. */
function lineup(body: AddMatchBody): AddMatchBody {
  return withLineup(body, [
    {
      player: KAB,
      goals: 2,
      rating: 8.5,
      stats: { assists: "0", mom: "1" },
    },
    { player: TREV, rating: 6.5, stats: { assists: "0", mom: "0" } },
  ]);
}

function opponentOf(body: AddMatchBody): { id: string; name: string } {
  const [id, club] = Object.entries(body.match.clubs).find(
    ([id]) => id !== OUR_CLUB_ID,
  ) ?? [""];
  return { id, name: String(club?.details?.name) };
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/** The page's `<meta>` tags, keyed by `property` or `name`. */
function metaTags(html: string): Map<string, string> {
  const head = html.slice(0, html.indexOf("</head>"));
  const tags = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/g)) {
    const key = tag.match(/\b(?:property|name)="([^"]+)"/)?.[1];
    const content = tag.match(/\bcontent="([^"]*)"/)?.[1];
    if (key && content !== undefined) {
      tags.set(
        key,
        content.replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (e) => ENTITIES[e]),
      );
    }
  }
  return tags;
}

function titleOf(html: string): string | undefined {
  return html.match(/<title>([^<]*)<\/title>/)?.[1];
}

/** Fetches a page as Discord's unfurler does and returns its head's tags. */
async function preview(request: APIRequestContext, path: string) {
  const response = await request.get(path, {
    headers: { "User-Agent": DISCORDBOT },
  });
  const html = await response.text();
  return { response, html, meta: metaTags(html), title: titleOf(html) };
}

test.beforeEach(async ({ fakeEa }) => {
  // Only the Matches each test adds.
  await fakeEa.setPayload("clubs/matches", [], "leagueMatch");
});

test("a Match's preview is its score line, Match Type, date, Outcome and top performer", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  const playedAt = new Date(Date.now() - 60 * MINUTE_MS);
  const body = lineup(
    loss({
      matchId: "938000000000001",
      matchType: "playoffMatch",
      goalsFor: 3,
      goalsAgainst: 7,
      playedAt,
    }),
  );
  const opponent = opponentOf(body);
  await fakeEa.setPayload("clubs/matches", [], "playoffMatch");
  await fakeEa.addMatch(body);
  await triggerPoll();

  const { meta, title } = await preview(request, "/matches/938000000000001");

  const scoreLine = `A Bloo Bloo 3–7 ${opponent.name}`;
  expect(meta.get("og:title")).toBe(scoreLine);
  expect(title).toBe(scoreLine);
  const description = meta.get("og:description") ?? "";
  expect(description).toContain("Playoff");
  expect(description).toContain(formatLondonDateTime(playedAt));
  expect(description).toContain("Loss");
  expect(description).toContain("Top performer: Kabeeble, 2 G");
  expect(meta.get("description")).toBe(description);
  expect(meta.get("og:type")).toBe("article");
  expect(meta.get("og:url")).toBe(`${SITE_URL}/matches/938000000000001`);
});

test("a Session's preview has its date, record and top performer", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  const start = new Date(Date.now() - 2 * 60 * MINUTE_MS);
  await fakeEa.addMatch(
    lineup(win({ matchId: "938000000000011", playedAt: start })),
  );
  await fakeEa.addMatch(
    lineup(
      loss({
        matchId: "938000000000012",
        playedAt: new Date(start.getTime() + 30 * MINUTE_MS),
      }),
    ),
  );
  await triggerPoll();

  const { meta, title } = await preview(request, "/sessions/938000000000011");

  const headline = `Session · ${formatLondonDate(start)} · W1 D0 L1`;
  expect(meta.get("og:title")).toBe(headline);
  expect(title).toBe(headline);
  expect(meta.get("og:description")).toContain("2 Matches");
  expect(meta.get("og:description")).toContain("Top performer: Kabeeble, 4 G");
  expect(meta.get("og:url")).toBe(`${SITE_URL}/sessions/938000000000011`);
});

test("a Squad Member's preview has their name, Appearances, G, A and average rating", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  await fakeEa.addMatch(lineup(win({ matchId: "938000000000021" })));
  await triggerPoll();

  const { meta, title } = await preview(request, `/players/${KAB.id}`);

  expect(title).toBe("Kabeeble");
  expect(meta.get("og:title")).toBe("Kabeeble");
  expect(meta.get("og:description")).toBe(
    "1 Appearance · 2 G · 0 A · 8.5 average rating",
  );
  expect(meta.get("og:url")).toBe(`${SITE_URL}/players/${KAB.id}`);
});

test("every page has a preview with the static card, and is never indexed", async ({
  request,
  fakeEa,
  triggerPoll,
}) => {
  const body = lineup(win({ matchId: "938000000000031" }));
  const opponent = opponentOf(body);
  await fakeEa.addMatch(body);
  await triggerPoll();

  const paths = [
    "/",
    "/squad",
    "/matches",
    "/opponents",
    "/trends",
    "/analysis",
    "/compare",
    "/matches/938000000000031",
    "/sessions/938000000000031",
    `/players/${KAB.id}`,
    `/opponents/${opponent.id}`,
    "/no-such-page",
  ];
  const titles = new Set<string>();
  for (const path of paths) {
    const { response, meta, title } = await preview(request, path);
    expect(response.headers()["x-robots-tag"], path).toBe("noindex, nofollow");
    expect(title, path).toBeTruthy();
    titles.add(title ?? "");
    expect(meta.get("og:title"), path).toBe(title);
    const description = meta.get("og:description") ?? "";
    expect(description.length, path).toBeGreaterThan(0);
    expect(description.length, path).toBeLessThanOrEqual(200);
    expect(meta.get("og:site_name"), path).toBe("A Bloo Bloo");
    expect(meta.get("og:type"), path).toMatch(/^(website|article)$/);
    expect(meta.get("og:url"), path).toMatch(new RegExp(`^${SITE_URL}/`));
    expect(meta.get("og:image"), path).toBe(CARD_URL);
    expect(meta.get("twitter:card"), path).toBe("summary_large_image");
    expect(meta.get("theme-color"), path).toBe(THEME_COLOR);
  }
  expect(titles.size).toBe(paths.length);

  // The card's absolute URL is this site's static asset.
  const card = await request.get(new URL(CARD_URL).pathname);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(card.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
