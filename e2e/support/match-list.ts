import type { Locator, Page } from "@playwright/test";

/**
 * The Session sections of the Match list on the home page, leaving out the
 * latest Match hero above them (which repeats the newest Match).
 */
export function matchList(page: Page): Locator {
  return page.locator('main section[aria-label^="Session, "]');
}
