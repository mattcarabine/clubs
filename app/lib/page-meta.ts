/**
 * Every page's `<title>`, description and link-preview tags (CLUBS-38), so a
 * link pasted into Discord or WhatsApp unfurls into a card. Previews never
 * mean indexing: every response still carries `X-Robots-Tag: noindex`.
 */
import type { MetaDescriptor } from "react-router";

import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  siteUrl,
} from "./site";
import { clampText } from "./text";

/** Unfurlers cut longer descriptions off mid-word, so ours stay under this. */
export const DESCRIPTION_MAX_LENGTH = 200;

export interface PagePreview {
  /** The page title, which is also the preview's headline. */
  title: string;
  description: string;
}

export interface PageMetaOptions extends PagePreview {
  /** The page's path, from the meta function's `location.pathname`. */
  path: string;
  /** "article" for one Match, Session or Squad Member; "website" for the rest. */
  type?: "website" | "article";
}

/**
 * The meta descriptors for a page. A route's meta replaces its parents', so
 * every route returns all of these from its own `meta()`.
 */
export function pageMeta({
  title,
  description,
  path,
  type = "website",
}: PageMetaOptions): MetaDescriptor[] {
  const summary = clampText(description, DESCRIPTION_MAX_LENGTH);
  return [
    { title },
    { name: "description", content: summary },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: summary },
    { property: "og:url", content: siteUrl(path) },
    { property: "og:image", content: siteUrl(`/${OG_IMAGE_PATH}`) },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: `The ${SITE_NAME} crest and name` },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/**
 * A preview title or description from its facts, joined with " · " and
 * skipping any that are missing.
 */
export function joinPreviewFacts(
  facts: readonly (string | null | undefined | false)[],
): string {
  return facts.filter(Boolean).join(" · ");
}
