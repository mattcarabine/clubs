/**
 * Player summaries (CLUBS-94): a short description of how a Squad Member
 * plays, from every recorded Match rather than one week (the coaching notes
 * are the weekly view), one for each Position Group they have played enough
 * in. One call per Squad Member covers them all, and only once a London
 * week they played in is over (released like the coaching notes, Monday
 * 09:00 London): the version is the week of their latest Appearance, so
 * someone who has not played since keeps the summary they have.
 */
import { latestCoachingWeek } from "~/lib/coaching-week";
import { POSITION_GROUPS, type PositionGroup } from "~/lib/domain";
import { formatPercentage } from "~/lib/number-format";
import {
  EVENT_STAT_IDS,
  EVENT_STATS,
  type EventStatId,
  type EventStatLine,
  formatEventStat,
  getPlayerSummaryBrief,
  INFLUENCE,
  type PlayerSummaryBrief,
  type PlayerSummarySubject,
  type PositionSummaryBrief,
  playerSummaryKey,
  playerSummarySubjects,
} from "~/stats";
import { revised } from "../config";
import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptName } from "../sanitise";
import { hasExactly, isText } from "../validate";
import { totalsInput } from "./inputs";

/** The most paragraphs a summary may have. */
export const MAX_PARAGRAPHS = 3;
/** The longest paragraph accepted, in characters. */
export const MAX_PARAGRAPH_LENGTH = 600;

type SummarySubject = Subject & Pick<PlayerSummarySubject, "weekStart">;

export const playerSummaryWriter: AiWriter<SummarySubject> = {
  kind: "player-summary",

  async subjects(db, now) {
    const due = await playerSummarySubjects(db, latestCoachingWeek(now));
    return due.map(({ playerId, weekStart }) => ({
      subjectKey: playerId,
      version: revised(weekStart),
      weekStart,
    }));
  },

  async task(db, subject) {
    const brief = await getPlayerSummaryBrief(
      db,
      subject.subjectKey,
      subject.weekStart,
      promptName,
    );
    return brief ? playerSummaryTask(brief, subject) : null;
  },
};

const INSTRUCTIONS = `Write a player summary for the Squad Member in the data: how they play, from every Match on record. The data has one entry per position they have played regularly.
- "summaries": one per position in the data, using its "positionGroup". Each has "paragraphs": two or three short paragraphs of two to four plain sentences each. First the kind of player they are in that position and what they bring. Then what they give away or do little of. A third only when something else stands out, such as where they shoot from, how they pass or where they win the ball.
- With more than one position, each summary stands alone and reads differently: a reader sees one at a time. Say what changes when they play there.
- This describes their style over the long run, not their form: nothing about this week, lately, or any one Match.
- Each stat sits beside the same figure for a typical opposing player in that position ("typicalOpponent") and how the two compare ("comparison"). Build each piece on the stats where they are clearly better or worse, and on their share of the team's work beside an even share of the minutes.
- Figures are per 90 minutes unless they are a percentage.
- Use six numbers at most in a summary, all from the data, and say what each means in football words. Never list stats.
- Name them in the third person, by the name in the data, never "you". Be blunt about weaknesses, but about the football, never the person, and never about a gap in EA's data.
- No headings, lists, bullet characters or sign-off.`;

/** The task for one Squad Member, from their brief. Exported for unit tests. */
export function playerSummaryTask(
  brief: PlayerSummaryBrief,
  { subjectKey, version }: Subject,
): GenerateTask {
  const positions = brief.positions.map((p) => p.positionGroup);
  return {
    kind: "player-summary",
    subjectKey,
    version,
    prompt: { system: HOUSE_STYLE, instructions: INSTRUCTIONS },
    input: {
      name: brief.name,
      positions: brief.positions.map(positionInput),
    },
    schema: outputSchema(positions),
    writeups: (output) => playerSummaryWriteups(output, subjectKey, positions),
  };
}

const isPositionGroup = (value: unknown): value is PositionGroup =>
  POSITION_GROUPS.includes(value as PositionGroup);

/**
 * One write-up per Position Group, keyed `playerSummaryKey`, or none unless
 * the reply has exactly one summary for each position in the input, each 1
 * to `MAX_PARAGRAPHS` paragraphs within `MAX_PARAGRAPH_LENGTH`. Exported
 * for unit tests.
 */
export function playerSummaryWriteups(
  output: unknown,
  playerId: string,
  positions: readonly PositionGroup[],
): WriteupDraft[] {
  if (!hasExactly(output, ["summaries"]) || !Array.isArray(output.summaries)) {
    return [];
  }
  const drafts = new Map<PositionGroup, WriteupDraft>();
  for (const summary of output.summaries) {
    if (
      !hasExactly(summary, ["positionGroup", "paragraphs"]) ||
      !isPositionGroup(summary.positionGroup) ||
      !positions.includes(summary.positionGroup) ||
      drafts.has(summary.positionGroup) ||
      !Array.isArray(summary.paragraphs)
    ) {
      return [];
    }
    const paragraphs: unknown[] = summary.paragraphs;
    if (
      paragraphs.length === 0 ||
      paragraphs.length > MAX_PARAGRAPHS ||
      !paragraphs.every((p) => isText(p, MAX_PARAGRAPH_LENGTH))
    ) {
      return [];
    }
    drafts.set(summary.positionGroup, {
      kind: "player-summary",
      subjectKey: playerSummaryKey(playerId, summary.positionGroup),
      text: paragraphs
        .map((p) => String(p).replace(/\s+/g, " ").trim())
        .join("\n\n"),
    });
  }
  return drafts.size === positions.length ? [...drafts.values()] : [];
}

function outputSchema(positions: readonly PositionGroup[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["summaries"],
    properties: {
      summaries: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["positionGroup", "paragraphs"],
          properties: {
            positionGroup: { type: "string", enum: [...positions] },
            paragraphs: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

const COMPARISON = {
  better: "better than a typical opponent",
  worse: "worse than a typical opponent",
  level: "about the same as a typical opponent",
} as const;

/** What each team share is a share of, for the prompt. */
const SHARE_OF = {
  goals: "our goals they scored or set up",
  shotsOnTarget: "our shots on target",
  ballWon: "the ball we won back",
  ballLost: "the ball we lost",
} as const;

const IN_INFLUENCE: ReadonlySet<EventStatId> = new Set([
  ...INFLUENCE.adds,
  ...INFLUENCE.costs,
]);

function positionInput({
  positionGroup,
  totals,
  events,
}: PositionSummaryBrief) {
  const lines = (ids: readonly EventStatId[]) =>
    ids.flatMap((id) => lineInput(events.lines[id]));
  return {
    positionGroup,
    matches: events.appearances,
    totals: totalsInput(totals),
    shareOfTheTeam: {
      anEvenShareOfTheMinutes: formatPercentage(events.teamShares.evenShare),
      shares: events.teamShares.shares.map((s) => ({
        of: SHARE_OF[s.id],
        share: formatPercentage(s.share),
      })),
    },
    whatTheyAdd: lines(INFLUENCE.adds),
    whatTheyGiveAway: lines(INFLUENCE.costs),
    theRest: lines(EVENT_STAT_IDS.filter((id) => !IN_INFLUENCE.has(id))),
    mixes: events.mixes.map((mix) => ({
      of: mix.id,
      shares: Object.fromEntries(
        mix.parts.map((p) => [p.label, formatPercentage(p.share)]),
      ),
    })),
  };
}

/** One stat beside its Yardstick; nothing for a stat with no figure. */
function lineInput({ id, value, yardstick, standing }: EventStatLine) {
  if (value === null) return [];
  const { label, description } = EVENT_STATS[id];
  return [
    {
      stat: label,
      meaning: description,
      value: formatEventStat(id, value),
      ...(yardstick !== null && {
        typicalOpponent: formatEventStat(id, yardstick),
      }),
      ...(standing && { comparison: COMPARISON[standing] }),
    },
  ];
}
