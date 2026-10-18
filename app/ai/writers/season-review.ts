/**
 * The Season Review writer (CLUBS-45): once a Season has ended (the Poll saw
 * the next one start), one call writes the review's intro, its outro and a
 * citation for each Award. The Awards are already decided by the rules in
 * `app/stats/awards.ts`; the model only writes about them. Written once per
 * Season: its version never changes.
 */
import { formatLondonDate } from "~/lib/london-time";
import { formatPercentage } from "~/lib/number-format";
import {
  type Award,
  divisionName,
  getSeasonReview,
  listFinishedSeasons,
  type MatchSummary,
  type RecordSummary,
  type RivalRecord,
  type SeasonReview,
  type Slot,
} from "~/stats";
import { revised } from "../config";
import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptName } from "../sanitise";
import { hasExactly, isText } from "../validate";
import { seasonReviewKey } from "../writeups";
import { resultInput } from "./inputs";

/** A review is written once; bump this only to rewrite every review. */
export const SEASON_REVIEW_VERSION = "1";

/** The longest intro or outro accepted, in characters. */
export const MAX_FRAME_LENGTH = 2_000;
/** The longest Award citation accepted. */
export const MAX_CITATION_LENGTH = 800;

export const seasonReviewWriter: AiWriter = {
  kind: "season-review",

  async subjects(db) {
    return (await listFinishedSeasons(db)).map((season) => ({
      subjectKey: String(season.number),
      version: revised(SEASON_REVIEW_VERSION),
    }));
  },

  async task(db, subject) {
    const review = await getSeasonReview(db, Number(subject.subjectKey));
    return review && seasonReviewTask(review, subject);
  },
};

const INSTRUCTIONS = `Write the Season Review for the Season in the data, which has just ended. A Season is one of EA's roughly six-week Pro Clubs seasons. An Award is a prize the site has already given to one Squad Member by a fixed rule; never question or change who won it.
- "intro": the opening, one or two short paragraphs: the story of the Season in headline terms. If "recordsBeganMidSeason" is true, say the recorded numbers cover the Season since records began on "from".
- "citations": one per Award, using its award id: two or three sentences celebrating the winner, built on the figures given for that Award.
- "outro": the closing, one short paragraph looking ahead to next Season.`;

/** The task for one finished Season. Exported for unit tests. */
export function seasonReviewTask(
  review: SeasonReview,
  { subjectKey, version }: Subject,
): GenerateTask {
  const awardIds = review.awards.map((a) => a.id);
  return {
    kind: "season-review",
    subjectKey,
    version,
    prompt: { system: HOUSE_STYLE, instructions: INSTRUCTIONS },
    input: seasonInput(review),
    schema: outputSchema(awardIds),
    writeups: (output) => seasonReviewWriteups(output, review.number, awardIds),
  };
}

/**
 * The write-ups in a reply, or none unless it fits the schema exactly: no
 * unexpected fields, one citation for every Award and no other, and every
 * text within its cap. Exported for unit tests.
 */
export function seasonReviewWriteups(
  output: unknown,
  number: number,
  awardIds: readonly string[],
): WriteupDraft[] {
  if (!hasExactly(output, ["intro", "citations", "outro"])) return [];
  const { intro, citations, outro } = output;
  if (
    !isText(intro, MAX_FRAME_LENGTH) ||
    !isText(outro, MAX_FRAME_LENGTH) ||
    !Array.isArray(citations) ||
    citations.length !== awardIds.length
  ) {
    return [];
  }
  const draft = (piece: Parameters<typeof seasonReviewKey>[1], text: string) =>
    ({
      kind: "season-review",
      subjectKey: seasonReviewKey(number, piece),
      text,
    }) satisfies WriteupDraft;
  const drafts = [draft("intro", intro), draft("outro", outro)];
  const cited = new Set<string>();
  for (const item of citations) {
    if (
      !hasExactly(item, ["award", "citation"]) ||
      typeof item.award !== "string" ||
      !awardIds.includes(item.award) ||
      cited.has(item.award) ||
      !isText(item.citation, MAX_CITATION_LENGTH)
    ) {
      return [];
    }
    cited.add(item.award);
    drafts.push(draft(`award/${item.award}`, item.citation));
  }
  return drafts;
}

function outputSchema(awardIds: readonly string[]) {
  const text = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["intro", "citations", "outro"],
    properties: {
      intro: text,
      citations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["award", "citation"],
          properties: {
            // An empty enum is invalid; a Season without Awards gets none.
            award: awardIds.length
              ? { type: "string", enum: [...awardIds] }
              : text,
            citation: text,
          },
        },
      },
      outro: text,
    },
  };
}

/** Every number the model may use, already computed. */
function seasonInput(review: SeasonReview) {
  const { division, whenWePlay: when } = review;
  return {
    season: {
      number: review.number,
      from: formatLondonDate(review.coveredFrom, review.endedAt),
      to: formatLondonDate(review.endedAt, review.endedAt),
      recordsBeganMidSeason: review.partial,
    },
    recordedMatches: recordInput(review.record),
    eaFinalTotals: review.eaRecord,
    divisionJourney: division && {
      promotions: division.promotions,
      relegations: division.relegations,
      bestDivision:
        division.bestDivision && divisionName(division.bestDivision),
      promotionSeries: division.promotionSeries.map((s) => ({
        division: divisionName(s.division),
        won: s.wins,
        played: s.played,
        promoted: s.promoted,
      })),
    },
    biggestWin: review.biggestWin && matchInput(review.biggestWin),
    heaviestDefeat: review.heaviestDefeat && matchInput(review.heaviestDefeat),
    bestSession: review.bestSession && {
      date: formatLondonDate(review.bestSession.start, review.endedAt),
      ...recordInput(review.bestSession.record),
    },
    whenWePlay: when && {
      busiestNight: {
        day: when.busiestNight.label,
        matches: when.busiestNight.played,
      },
      busiestKickOff: {
        time: when.busiestTime.label,
        matches: when.busiestTime.played,
      },
      bestSlot: when.best && slotInput(when.best),
      worstSlot: when.worst && slotInput(when.worst),
    },
    nemesis: review.nemesis && rivalInput(review.nemesis),
    favouriteOpponent:
      review.favouriteOpponent && rivalInput(review.favouriteOpponent),
    awards: review.awards.map(awardInput),
  };
}

function recordInput(record: RecordSummary) {
  return {
    played: record.played,
    won: record.wins,
    drawn: record.draws,
    lost: record.losses,
    goalsFor: record.goalsFor,
    goalsAgainst: record.goalsAgainst,
    winPercentage: formatPercentage(record.winPercentage),
  };
}

function matchInput(match: MatchSummary) {
  return {
    ...resultInput(match),
    matchType: match.matchType,
    date: formatLondonDate(match.playedAt, match.playedAt),
  };
}

function slotInput(slot: Slot) {
  return {
    slot: slot.label,
    matches: slot.played,
    wins: slot.wins,
    winPercentage: formatPercentage(slot.winPercentage),
  };
}

function rivalInput(rival: RivalRecord) {
  return {
    name: promptName(rival.name),
    matches: rival.played,
    wins: rival.wins,
    drawsAndDefeats: rival.droppedPoints,
  };
}

function awardInput(award: Award) {
  return {
    award: award.id,
    title: award.title,
    winner: promptName(award.name),
    figure: `${award.value} ${award.unit}`,
    detail: award.detail,
  };
}
