/**
 * Link-preview headlines and descriptions (CLUBS-38) for one Match, Session
 * or Squad Member, from the same formulas and formats as their pages. Pure,
 * so route `meta()` functions can call them on the server and the client.
 *
 * Match and Session previews take an optional write-up (CLUBS-35's Match
 * report or Session recap) and quote its first sentence, unlabelled.
 */
import { OUTCOME_LABEL } from "~/lib/domain";
import { formatLondonDate, formatLondonDateTime } from "~/lib/london-time";
import { formatCount, formatDecimal } from "~/lib/number-format";
import { joinPreviewFacts, type PagePreview } from "~/lib/page-meta";
import { firstSentence } from "~/lib/text";

import type { Award } from "./awards";
import type { MatchDetail } from "./matches";
import { type PerformerTotals, sessionTopPerformer } from "./sessions";
import type { PlayerTotals, RecordSummary } from "./summaries";
import {
  formatPerformerStat,
  type PerformerInput,
  topPerformers,
} from "./top-performers";

/** "A Bloo Bloo 3–7 Kebab Over6pack": Our Club first, as on the ScoreBar. */
export function scoreLine(
  clubName: string,
  match: Pick<MatchDetail, "goalsFor" | "goalsAgainst" | "opponent">,
): string {
  return `${clubName} ${match.goalsFor}–${match.goalsAgainst} ${match.opponent.name}`;
}

type MatchPreviewInput = Pick<
  MatchDetail,
  | "matchType"
  | "playedAt"
  | "outcome"
  | "dnf"
  | "goalsFor"
  | "goalsAgainst"
  | "opponent"
> & {
  /** Our Club's Appearances. */
  ours: readonly PerformerInput[];
};

interface MatchWriting {
  /** The Match's headline (CLUBS-43), which leads the description. */
  headline?: string | null;
  /** The Match report, whose first sentence ends it. */
  writeUp?: string | null;
}

/**
 * Headline: the score line. Description: the Match's headline, then
 * "Playoff · Sat 17 Oct, 20:30 · Loss · Top performer: Dan, 2 G · 1 A", then
 * the write-up's first sentence.
 */
export function matchPreview(
  clubName: string,
  match: MatchPreviewInput,
  { headline, writeUp }: MatchWriting = {},
): PagePreview {
  const [top] = topPerformers(match.ours);
  return {
    title: scoreLine(clubName, match),
    description: joinPreviewFacts([
      headline,
      match.matchType,
      formatLondonDateTime(match.playedAt),
      match.dnf
        ? `${OUTCOME_LABEL[match.outcome]} (DNF)`
        : OUTCOME_LABEL[match.outcome],
      top &&
        `Top performer: ${top.name}, ${formatPerformerStat(top, top.rating)}`,
      writeUp && firstSentence(writeUp),
    ]),
  };
}

interface SessionPreviewInput {
  start: Date;
  record: RecordLine;
  players: readonly PerformerTotals[];
}

type RecordLine = Pick<
  RecordSummary,
  "played" | "wins" | "draws" | "losses" | "goalsFor" | "goalsAgainst"
>;

/** "W4 D0 L4". */
function formatRecord({ wins, draws, losses }: RecordLine): string {
  return `W${wins} D${draws} L${losses}`;
}

/** "8 Matches · 12 scored, 9 conceded". */
function recordFacts(record: RecordLine): string[] {
  return [
    formatCount(record.played, "Match", "Matches"),
    `${record.goalsFor} scored, ${record.goalsAgainst} conceded`,
  ];
}

/**
 * Headline: "Session · Sat 17 Oct · W4 D0 L4". Description: the Matches and
 * goals, the top performer, then the write-up's first sentence.
 */
export function sessionPreview(
  session: SessionPreviewInput,
  writeUp?: string | null,
): PagePreview {
  const { record } = session;
  const top = sessionTopPerformer(session.players);
  return {
    title: joinPreviewFacts([
      "Session",
      formatLondonDate(session.start),
      formatRecord(record),
    ]),
    description: joinPreviewFacts([
      ...recordFacts(record),
      top &&
        `Top performer: ${top.name}, ${formatPerformerStat(top, top.averageRating)}`,
      writeUp && firstSentence(writeUp),
    ]),
  };
}

/**
 * Headline: the Squad Member's name. Description: "24 Appearances · 9 G ·
 * 6 A · 7.4 average rating".
 */
export function playerPreview(
  name: string,
  totals: Pick<
    PlayerTotals,
    "appearances" | "goals" | "assists" | "averageRating"
  >,
): PagePreview {
  return {
    title: name,
    description: joinPreviewFacts([
      formatCount(totals.appearances, "Appearance", "Appearances"),
      `${totals.goals} G`,
      `${totals.assists} A`,
      totals.averageRating !== null &&
        `${formatDecimal(totals.averageRating)} average rating`,
    ]),
  };
}

/**
 * Headline: "Season 3 Review · A Bloo Bloo". Description: "W12 D3 L6 · 21
 * Matches · 48 scored, 30 conceded · Player of the Season: Kabeeble ·
 * Golden Boot: Trevor", the first two Awards.
 */
export function seasonReviewPreview(
  clubName: string,
  review: {
    number: number;
    record: RecordLine;
    awards: readonly Pick<Award, "title" | "name">[];
  },
): PagePreview {
  return {
    title: `Season ${review.number} Review · ${clubName}`,
    description: joinPreviewFacts([
      formatRecord(review.record),
      ...recordFacts(review.record),
      ...review.awards
        .slice(0, 2)
        .map((award) => `${award.title}: ${award.name}`),
    ]),
  };
}

/**
 * Headline: "A Bloo Bloo v Kebab Over6pack". Description: the head-to-head
 * record, "Head-to-head W3 D1 L2 · 6 Matches · 12 scored, 9 conceded".
 */
export function opponentPreview(
  clubName: string,
  opponentName: string,
  record: RecordLine,
): PagePreview {
  return {
    title: `${clubName} v ${opponentName}`,
    description: joinPreviewFacts([
      `Head-to-head ${formatRecord(record)}`,
      ...recordFacts(record),
    ]),
  };
}
