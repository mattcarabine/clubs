/**
 * Player summaries (CLUBS-94): a short description of how a Squad Member
 * plays, from every recorded Match rather than one week (the coaching notes
 * are the weekly view). One call per Squad Member, and only once a London
 * week they played in is over (released like the coaching notes, Monday
 * 09:00 London): the version is the week of their latest Appearance, so
 * someone who has not played since keeps the summary they have.
 */
import { latestCoachingWeek } from "~/lib/coaching-week";
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

const INSTRUCTIONS = `Write a player summary for the Squad Member in the data: how they play, from every Match on record in their main position.
- "paragraphs": two or three short paragraphs of two to four plain sentences each. First the kind of player they are and what they bring. Then what they give away or do little of. A third only when something else stands out, such as where they shoot from, how they pass or where they win the ball.
- This describes their style over the long run, not their form: nothing about this week, lately, or any one Match.
- Each stat sits beside the same figure for a typical opposing player in their position ("typicalOpponent") and how the two compare ("comparison"). Build the piece on the stats where they are clearly better or worse, and on their share of the team's work beside an even share of the minutes.
- Figures are per 90 minutes unless they are a percentage.
- Use six numbers at most, all from the data, and say what each means in football words. Never list stats.
- Name them in the third person, by the name in the data, never "you". Be blunt about weaknesses, but about the football, never the person, and never about a gap in EA's data.
- No headings, lists, bullet characters or sign-off.`;

/** The task for one Squad Member, from their brief. Exported for unit tests. */
export function playerSummaryTask(
  brief: PlayerSummaryBrief,
  { subjectKey, version }: Subject,
): GenerateTask {
  return {
    kind: "player-summary",
    subjectKey,
    version,
    prompt: { system: HOUSE_STYLE, instructions: INSTRUCTIONS },
    input: briefInput(brief),
    schema: OUTPUT_SCHEMA,
    writeups: (output) => playerSummaryWriteups(output, subjectKey),
  };
}

/**
 * The summary, or none unless the reply is exactly 1 to `MAX_PARAGRAPHS`
 * paragraphs within `MAX_PARAGRAPH_LENGTH`. Exported for unit tests.
 */
export function playerSummaryWriteups(
  output: unknown,
  playerId: string,
): WriteupDraft[] {
  if (
    !hasExactly(output, ["paragraphs"]) ||
    !Array.isArray(output.paragraphs)
  ) {
    return [];
  }
  const paragraphs: unknown[] = output.paragraphs;
  if (
    paragraphs.length === 0 ||
    paragraphs.length > MAX_PARAGRAPHS ||
    !paragraphs.every((p) => isText(p, MAX_PARAGRAPH_LENGTH))
  ) {
    return [];
  }
  return [
    {
      kind: "player-summary",
      subjectKey: playerId,
      text: paragraphs
        .map((p) => String(p).replace(/\s+/g, " ").trim())
        .join("\n\n"),
    },
  ];
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["paragraphs"],
  properties: {
    paragraphs: { type: "array", items: { type: "string" } },
  },
};

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

function briefInput({
  name,
  mainPosition,
  totals,
  events,
}: PlayerSummaryBrief) {
  const lines = (ids: readonly EventStatId[]) =>
    ids.flatMap((id) => lineInput(events.lines[id]));
  return {
    name,
    mainPosition: mainPosition ?? "Unknown",
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
