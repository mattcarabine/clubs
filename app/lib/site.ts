/**
 * The site's public address and name, for absolute links in link previews
 * (CLUBS-38). Production serves this domain (`routes` in `wrangler.jsonc`);
 * every environment, the E2E one included, links to it so a shared preview
 * always points somewhere real.
 */
export const SITE_URL = "https://clubs.marabine.co.uk";

/** `og:site_name`, and the name on the preview card. */
export const SITE_NAME = "A Bloo Bloo";

/**
 * `theme-color`: the `sound-900` token in `app/app.css`. A meta tag cannot
 * read a CSS variable, so it repeats the hex.
 */
export const THEME_COLOR = "#0f3f7a";

/** The static preview card in `public/`, drawn by `pnpm og:card`. */
export const OG_IMAGE_PATH = "og-card.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/** An absolute URL on the site for a path such as "/matches/1". */
export function siteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}
