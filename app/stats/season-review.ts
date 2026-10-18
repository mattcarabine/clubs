/**
 * The Season Review (CLUBS-45): the story of one finished Season, from its
 * recorded Matches, Our Club's Appearances in them and EA's final season
 * totals. Pure, so every pick and tie-break is unit tested; the query lives
 * in `season-review-query.ts`.
 *
 * Each part is null (and its card skipped) when its data is missing or would
 * mean nothing, the EmptyState rule: no Nemesis when every Opponent took
 * points off us once, no best slot when no slot has enough Matches.
 */
import { snapshotNumber } from "~/ea/parse";
import { londonParts, WEEKDAYS } from "~/lib/london-time";

import { type Award, seasonAwards } from "./awards";
import { replayCampaigns } from "./campaigns";
import { type DivisionNumber, toDivisionNumber } from "./divisions";
import type { MatchSummary } from "./matches";
import {
  MIN_SPLIT_MATCHES,
  TIME_OF_DAY,
  timeOfDay,
  type WinRecord,
  winRecord,
} from "./outcome-split";
import { groupSessions } from "./sessions";
import type { SnapshotPoint } from "./snapshots";
import type { SquadAppearance } from "./squad";
import { groupBy, type RecordSummary, summariseRecord } from "./summaries";

/** A finished Season: it ends where the next one starts. */
export interface FinishedSeason {
  number: number;
  startedAt: Date;
  endedAt: Date;
}

export interface SeasonReviewInput {
  season: FinishedSeason;
  /** The Season's Competitive Matches, oldest first. */
  matches: readonly MatchSummary[];
  /** Our Club's Appearances in them, oldest first. */
  appearances: readonly SquadAppearance[];
  /** Our Club's last current-season leaderboard Snapshot before the reset. */
  finalSnapshot: SnapshotPoint | null;
}

/** EA's final record for the Season, from the leaderboard Snapshot. */
export interface EaSeasonRecord {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface DivisionJourney {
  promotions: number;
  relegations: number;
  /** The highest Division reached (1 = Elite). */
  bestDivision: DivisionNumber | null;
  /** Each Promotion Series played, oldest first (tracked Seasons only). */
  promotionSeries: PromotionSeriesResult[];
}

export interface PromotionSeriesResult {
  division: DivisionNumber;
  wins: number;
  played: number;
  promoted: boolean;
}

export interface BestSession {
  id: string;
  start: Date;
  record: RecordSummary;
}

export interface Slot extends WinRecord {
  label: string;
}

export interface WhenWePlay {
  /** The weekday with the most Matches: "Fri". */
  busiestNight: Slot;
  /** The kick-off band with the most Matches. */
  busiestTime: Slot;
  /** The best and worst weekday-and-band slots by Win %, each with `MIN_SPLIT_MATCHES`; null unless they differ. */
  best: Slot | null;
  worst: Slot | null;
}

export interface RivalRecord {
  clubId: string;
  name: string;
  played: number;
  wins: number;
  droppedPoints: number;
}

export interface SeasonReview {
  number: number;
  /** The Season's start, or the first recorded Match when records began mid-Season. */
  coveredFrom: Date;
  endedAt: Date;
  /** Records began after the Season started ("since records began 17 Oct"). */
  partial: boolean;
  record: RecordSummary;
  /** EA's totals, only when they cover more Matches than we recorded. */
  eaRecord: EaSeasonRecord | null;
  division: DivisionJourney | null;
  biggestWin: MatchSummary | null;
  heaviestDefeat: MatchSummary | null;
  bestSession: BestSession | null;
  whenWePlay: WhenWePlay | null;
  nemesis: RivalRecord | null;
  favouriteOpponent: RivalRecord | null;
  awards: Award[];
}

/** A Nemesis needs this many Dropped Points against them, a favourite this many Wins. */
export const MIN_RIVAL_RESULTS = 2;

/** Season 1 began before tracking, at the epoch (`app/poll/seasons.ts`). */
function startedBeforeRecords(season: FinishedSeason): boolean {
  return season.startedAt.getTime() === 0;
}

/** The Season Review, or null for a Season with no recorded Matches. */
export function seasonReview({
  season,
  matches,
  appearances,
  finalSnapshot,
}: SeasonReviewInput): SeasonReview | null {
  const [first] = matches;
  if (!first) return null;
  const record = summariseRecord(matches);
  const partial = startedBeforeRecords(season);
  const { nemesis, favourite } = rivals(matches);
  return {
    number: season.number,
    coveredFrom: partial ? first.playedAt : season.startedAt,
    endedAt: season.endedAt,
    partial,
    record,
    eaRecord: moreCompleteEaRecord(finalSnapshot, record),
    division: divisionJourney(season, matches, finalSnapshot),
    biggestWin: widestMargin(matches, "W"),
    heaviestDefeat: widestMargin(matches, "L"),
    bestSession: bestSession(matches),
    whenWePlay: whenWePlay(matches),
    nemesis,
    favouriteOpponent: favourite,
    awards: seasonAwards(appearances, matches.length),
  };
}

/** EA's record from the final Snapshot, when it counts more Matches than we recorded. */
export function moreCompleteEaRecord(
  snapshot: SnapshotPoint | null,
  recorded: RecordSummary,
): EaSeasonRecord | null {
  if (!snapshot) return null;
  const read = (key: string) => snapshotNumber(snapshot.stats, key);
  const values = {
    played: read("gamesPlayed"),
    wins: read("wins"),
    draws: read("ties"),
    losses: read("losses"),
    goalsFor: read("goals"),
    goalsAgainst: read("goalsAgainst"),
  };
  const complete = Object.values(values).every((v) => v !== null);
  if (!complete || (values.played ?? 0) <= recorded.played) return null;
  return values as EaSeasonRecord;
}

/**
 * Promotions, Relegations and the best Division from EA's final Snapshot
 * where it has them, else from the Campaign replay (CLUBS-41), which also
 * gives the Promotion Series. Season 1 started before tracking, so it has
 * no Campaigns. Null when neither says anything.
 */
export function divisionJourney(
  season: FinishedSeason,
  matches: readonly MatchSummary[],
  snapshot: SnapshotPoint | null,
): DivisionJourney | null {
  const { campaigns } = replayCampaigns(
    matches,
    startedBeforeRecords(season) ? [] : [season.startedAt],
  );
  const count = (outcome: string) =>
    campaigns.filter((c) => c.outcome === outcome).length;
  const tracked = campaigns.length
    ? {
        promotions: count("promoted"),
        relegations: count("relegated"),
        bestDivision: Math.min(...campaigns.map((c) => c.division)),
      }
    : null;
  const read = (key: string) =>
    snapshot ? snapshotNumber(snapshot.stats, key) : null;
  const promotions = read("promotions") ?? tracked?.promotions ?? null;
  const relegations = read("relegations") ?? tracked?.relegations ?? null;
  const bestDivision = toDivisionNumber(
    read("bestDivision") ?? tracked?.bestDivision ?? null,
  );
  const promotionSeries = campaigns
    .filter((c) => c.promotionSeries.length > 0)
    .map((c) => ({
      division: c.division,
      wins: c.promotionSeries.filter((m) => m.outcome === "W").length,
      played: c.promotionSeries.length,
      promoted: c.outcome === "promoted",
    }));
  if (promotions === null && relegations === null && bestDivision === null) {
    return null;
  }
  return {
    promotions: promotions ?? 0,
    relegations: relegations ?? 0,
    bestDivision,
    promotionSeries,
  };
}

/**
 * The Win (or loss) by the most goals, DNFs left out (EA awards those).
 * Ties: more goals for a Win (against for a loss), then the earlier Match.
 */
export function widestMargin(
  matches: readonly MatchSummary[],
  outcome: "W" | "L",
): MatchSummary | null {
  const sign = outcome === "W" ? 1 : -1;
  const margin = (m: MatchSummary) => sign * (m.goalsFor - m.goalsAgainst);
  const decisive = (m: MatchSummary) =>
    outcome === "W" ? m.goalsFor : m.goalsAgainst;
  const [top] = matches
    .filter((m) => m.outcome === outcome && !m.dnf)
    .sort(
      (a, b) =>
        margin(b) - margin(a) ||
        decisive(b) - decisive(a) ||
        a.playedAt.getTime() - b.playedAt.getTime(),
    );
  return top ?? null;
}

/**
 * The Session with the most Wins (at least one). Ties: fewer Dropped
 * Points, then more goals for, then the earlier Session. Sessions are
 * grouped over the Season's Matches.
 */
export function bestSession(
  matches: readonly MatchSummary[],
): BestSession | null {
  const byId = new Map(matches.map((m) => [m.matchId, m]));
  const sessions = groupSessions(matches).map((group) => ({
    id: group.id,
    start: group.start,
    record: summariseRecord(group.matchIds.flatMap((id) => byId.get(id) ?? [])),
  }));
  const [top] = sessions
    .filter((s) => s.record.wins > 0)
    .sort(
      (a, b) =>
        b.record.wins - a.record.wins ||
        a.record.draws + a.record.losses - (b.record.draws + b.record.losses) ||
        b.record.goalsFor - a.record.goalsFor ||
        a.start.getTime() - b.start.getTime(),
    );
  return top ?? null;
}

/**
 * When we play (London time), once the Season has `MIN_SPLIT_MATCHES`: the
 * busiest weekday and kick-off band (ties: the higher Win %, then the
 * earlier in the week or day), and the best and worst weekday-and-band
 * slots by Win % among those with `MIN_SPLIT_MATCHES` (ties: more Matches,
 * then the earlier slot), shown only when they differ.
 */
export function whenWePlay(
  matches: readonly MatchSummary[],
): WhenWePlay | null {
  if (matches.length < MIN_SPLIT_MATCHES) return null;
  const busiest = (slots: RankedSlot[]) =>
    top(
      slots,
      (a, b) => b.played - a.played || rate(b) - rate(a) || a.order - b.order,
    );
  const qualifying = slotsBy(matches, weekdayAndKickOff).filter(
    (s) => s.played >= MIN_SPLIT_MATCHES,
  );
  const byRate = (sign: 1 | -1) =>
    top(
      qualifying,
      (a, b) =>
        sign * (rate(b) - rate(a)) || b.played - a.played || a.order - b.order,
    );
  const busiestNight = busiest(slotsBy(matches, weekday));
  const busiestTime = busiest(slotsBy(matches, kickOff));
  // Never hit: every Match falls on some weekday and in some band.
  if (!busiestNight || !busiestTime) return null;
  const best = byRate(1);
  const worst = byRate(-1);
  const differ = best && worst && rate(best) > rate(worst);
  return {
    busiestNight: slot(busiestNight),
    busiestTime: slot(busiestTime),
    best: differ ? slot(best) : null,
    worst: differ ? slot(worst) : null,
  };
}

/** A slot's label and where it falls in the week or day, for ties. */
interface SlotPosition {
  label: string;
  order: number;
}

type RankedSlot = Slot & SlotPosition;

/** The London weekday: "Fri". */
function weekday(match: MatchSummary): SlotPosition {
  const label = londonParts(match.playedAt).weekday;
  return { label, order: WEEKDAYS.indexOf(label) };
}

/** The kick-off band: "20:00–22:00". */
function kickOff(match: MatchSummary): SlotPosition {
  const id = timeOfDay(match.playedAt);
  const order = TIME_OF_DAY.findIndex((band) => band.id === id);
  return { label: TIME_OF_DAY[order].label, order };
}

/** The weekday and kick-off band together: "Fri 20:00–22:00". */
function weekdayAndKickOff(match: MatchSummary): SlotPosition {
  const day = weekday(match);
  const band = kickOff(match);
  return {
    label: `${day.label} ${band.label}`,
    order: day.order * TIME_OF_DAY.length + band.order,
  };
}

function slotsBy(
  matches: readonly MatchSummary[],
  position: (m: MatchSummary) => SlotPosition,
): RankedSlot[] {
  const groups = groupBy(matches, (m) => position(m).label);
  return [...groups].map(([label, group]) => ({
    label,
    order: position(group[0]).order,
    ...winRecord(group.map((m) => m.outcome)),
  }));
}

/** The first slot by `compare`, without sorting `slots` in place. */
function top(
  slots: readonly RankedSlot[],
  compare: (a: RankedSlot, b: RankedSlot) => number,
): RankedSlot | undefined {
  return [...slots].sort(compare)[0];
}

function slot({ order: _, ...rest }: RankedSlot): Slot {
  return rest;
}

function rate(slot: WinRecord): number {
  return slot.winPercentage ?? 0;
}

/**
 * The Nemesis (most Dropped Points against, at least `MIN_RIVAL_RESULTS`;
 * ties: more losses, then more Matches) and the favourite Opponent (most
 * Wins, at least `MIN_RIVAL_RESULTS`; ties: more goals scored against them,
 * then fewer Matches). Then by name.
 */
export function rivals(matches: readonly MatchSummary[]): {
  nemesis: RivalRecord | null;
  favourite: RivalRecord | null;
} {
  const rows = [...groupBy(matches, (m) => m.opponent.clubId)].map(
    ([clubId, group]) => {
      const record = summariseRecord(group);
      return {
        clubId,
        name: group.at(-1)?.opponent.name ?? clubId,
        played: record.played,
        wins: record.wins,
        droppedPoints: record.draws + record.losses,
        losses: record.losses,
        goalsFor: record.goalsFor,
      };
    },
  );
  const pick = (
    eligible: (r: (typeof rows)[number]) => boolean,
    compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number,
  ): RivalRecord | null => {
    const [top] = rows
      .filter(eligible)
      .sort((a, b) => compare(a, b) || a.name.localeCompare(b.name));
    if (!top) return null;
    const { losses: _l, goalsFor: _g, ...opponent } = top;
    return opponent;
  };
  return {
    nemesis: pick(
      (r) => r.droppedPoints >= MIN_RIVAL_RESULTS,
      (a, b) =>
        b.droppedPoints - a.droppedPoints ||
        b.losses - a.losses ||
        b.played - a.played,
    ),
    favourite: pick(
      (r) => r.wins >= MIN_RIVAL_RESULTS,
      (a, b) =>
        b.wins - a.wins || b.goalsFor - a.goalsFor || a.played - b.played,
    ),
  };
}
