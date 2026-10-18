/**
 * `pnpm og:card`: draws the link-preview card, `public/og-card.png`, that
 * every page's `og:image` points at (CLUBS-38). Run it again only when the
 * crest, the club name or the palette changes, and commit the result.
 *
 * The card is static on purpose: rendering an image per request would not
 * fit the free plan's CPU limit or the Worker size limit (ADR 0006). It is
 * drawn by headless Chromium from HTML, so it uses the site's own tokens
 * (read from `app/app.css`) and display font.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_NAME,
} from "../app/lib/site.ts";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", OG_IMAGE_PATH);

/** A colour token's hex value from the `@theme` block in `app/app.css`. */
function token(name: string): string {
  const css = readFileSync(path.join(ROOT, "app/app.css"), "utf8");
  const value = css.match(
    new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`),
  )?.[1];
  if (!value) throw new Error(`No colour token --color-${name} in app.css`);
  return value;
}

const crest = readFileSync(path.join(ROOT, "assets/crest.png")).toString(
  "base64",
);

const html = `<!doctype html>
<html>
<head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sofia+Sans+Extra+Condensed:ital,wght@1,800&family=Sofia+Sans:wght@600&display=block">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${OG_IMAGE_WIDTH}px; height: ${OG_IMAGE_HEIGHT}px;
    background: ${token("shale-950")};
    display: flex; align-items: center; gap: 64px; padding: 0 96px;
    position: relative; overflow: hidden;
  }
  /* Our Club's deep blue as an angled strip, like the ScoreBar's panel. */
  .band {
    position: absolute; top: 0; bottom: 0; right: 0; width: 100px;
    background: ${token("sound-900")};
    clip-path: polygon(60px 0, 100% 0, 100% 100%, 0 100%);
  }
  .rule { position: absolute; left: 0; right: 0; bottom: 0; height: 12px; background: ${token("rave")}; }
  img { position: relative; width: 240px; height: 240px; }
  .text { position: relative; display: flex; flex-direction: column; gap: 20px; }
  .tab {
    align-self: flex-start;
    background: ${token("rave")}; color: ${token("shale-950")};
    font: 600 30px "Sofia Sans", sans-serif; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 6px 36px 6px 18px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
  }
  h1 {
    color: ${token("ink")};
    font: italic 800 168px/0.85 "Sofia Sans Extra Condensed", sans-serif;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="band"></div>
  <img src="data:image/png;base64,${crest}" alt="">
  <div class="text">
    <span class="tab">Club stats</span>
    <h1>${SITE_NAME}</h1>
  </div>
  <div class="rule"></div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
  });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT });
  console.log(`Wrote ${OUT}`);
} finally {
  await browser.close();
}
