/**
 * Helpers for specs about Match Events (CLUBS-86, CLUBS-87): built Matches
 * whose players carry chosen events, and the Match page's line-up tables.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import type { EaPlayerStats } from "../../app/ea/types.ts";
import type { AddMatchBody } from "../fake-ea/control.ts";

export const KABEEBLE = "256171605";
export const TINBS = "380993182";
export const OPPONENT_ID = "356611";
export const THEIR_MIDFIELDER = "1011157123282";
export const FULL_MATCH = 90 * 60;

export type Events = Record<number, number>;

/** A built Match with every player's Match Events removed, so each test sets its own. */
export function bare(fake: AddMatchBody): AddMatchBody {
  for (const players of Object.values(fake.match.players)) {
    for (const player of Object.values(players)) {
      for (const field of Object.keys(player)) {
        if (field.startsWith("match_event_aggregate_")) delete player[field];
      }
    }
  }
  return fake;
}

/** Gives one player exactly these Match Events over exactly 90 minutes. */
export function playing(
  fake: AddMatchBody,
  clubId: string,
  playerId: string,
  events: Events,
  stats: EaPlayerStats = {},
): AddMatchBody {
  Object.assign(fake.match.players[clubId][playerId], {
    secondsPlayed: String(FULL_MATCH),
    match_event_aggregate_0: Object.entries(events)
      .map(([code, count]) => `${code}:${count}`)
      .join(","),
    ...stats,
  });
  return fake;
}

export function lineup(page: Page, club: string) {
  return page.getByRole("table", { name: `${club} line-up` });
}

export async function lineupCell(
  table: Locator,
  player: string,
  header: string,
) {
  const headers = await table.getByRole("columnheader").allTextContents();
  const index = headers.findIndex((h) => h.trim() === header);
  expect(index, `column ${header}`).toBeGreaterThan(0);
  return table
    .locator("tbody tr")
    .filter({
      has: table.page().getByRole("rowheader", { name: new RegExp(player) }),
    })
    .getByRole("cell")
    .nth(index - 1);
}
