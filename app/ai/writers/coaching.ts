/**
 * Coaching notes (CLUBS-44): once a London week is over, the first Poll
 * after 09:00 London on the Monday writes 2 to 4 short points for every
 * Squad Member who played in it, in one call. Only the latest such week is
 * ever a subject, so a release backfills that week and no older one. The
 * version is who played, so notes are written once per player per week; a
 * late Match only rewrites the week when it brings in someone new, and
 * pages show the latest notes per week.
 */
import {
  type CoachingWeek,
  coachingWeek,
  coachingWeekLastMoment,
  latestCoachingWeek,
} from "~/lib/coaching-week";
import { formatLondonDate } from "~/lib/london-time";
import { formatDecimal, formatPercentage } from "~/lib/number-format";
import {
  coachingPlayerIds,
  getCoachingBriefs,
  type PlayerCoachingBrief,
  type PlayerTotals,
  type SquadAppearance,
} from "~/stats";
import { revised } from "../config";
import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptName } from "../sanitise";
import { hasExactly } from "../validate";
import { recentWriteups } from "../writeups";
import {
  appearanceStatsInput,
  proseLabels,
  recentWritingContext,
  resultInput,
} from "./inputs";

/** How many recent players' notes a call sees, so it doesn't repeat them. */
const RECENT_NOTES = 8;

/** The most points one Squad Member's notes may have. */
export const MAX_POINTS = 4;
/** The longest point accepted, in characters. */
export const MAX_POINT_LENGTH = 400;
/** Points are stored one per paragraph, so `paragraphs` splits them again. */
export const POINT_SEPARATOR = "\n\n";

export const coachingWriter: AiWriter = {
  kind: "coaching",

  async subjects(db, now) {
    const week = latestCoachingWeek(now);
    const playerIds = await coachingPlayerIds(db, week);
    if (playerIds.length === 0) return [];
    return [{ subjectKey: week.start, version: revised(playerIds.join(",")) }];
  },

  async task(db, subject) {
    // The subject's key is the week's Monday.
    const week = coachingWeek(subject.subjectKey);
    const [briefs, recent] = await Promise.all([
      getCoachingBriefs(db, week, promptName),
      recentWriteups(db, "coaching", RECENT_NOTES),
    ]);
    return briefs.length ? coachingTask(week, briefs, subject, recent) : null;
  },
};

const INSTRUCTIONS = `Write this week's coaching notes for each Squad Member in the data.
- For these notes you are the club's coach rather than a pundit: encouraging but honest, specific and practical.
- "notes": one entry per Squad Member, using their playerId. "points" holds 2 to 4 short points, each one or two plain sentences: what is working, what to work on, and one concrete focus for next week, e.g. "Conversion fell to 18% while shots rose; take one more touch."
- Name the Squad Member in the third person, by the name in the data, never "you": the whole squad reads every note.
- Ground every point in their numbers: this week's Matches against their recent changes, their form, their stats by Position Group, their stats in wins against draws and defeats, and their all-time totals. Every number must be in the data.
- Honest means blunt about what went badly, but always about football, never the person, and never about a gap in EA's data.
- Vary the points' openings and phrasing from player to player, and from the recent notes in the background.
- Each point stands alone: no numbering, dashes or bullet characters, and no sign-off.`;

/** The task for one week, from its briefs. Exported for unit tests. */
export function coachingTask(
  week: CoachingWeek,
  briefs: readonly PlayerCoachingBrief[],
  { subjectKey, version }: Subject,
  recentNotes: readonly string[] = [],
): GenerateTask {
  const playerIds = briefs.map((b) => b.playerId);
  return {
    kind: "coaching",
    subjectKey,
    version,
    prompt: {
      system: HOUSE_STYLE,
      ...recentWritingContext("coachingNotes", recentNotes),
      instructions: INSTRUCTIONS,
    },
    input: {
      week: {
        from: formatLondonDate(week.from, week.from),
        to: formatLondonDate(coachingWeekLastMoment(week), week.from),
      },
      squadMembers: briefs.map(briefInput),
    },
    schema: outputSchema(playerIds),
    writeups: (output) => coachingWriteups(output, playerIds),
  };
}

/**
 * One write-up per Squad Member, keyed by player ID, or none unless the
 * reply fits the schema exactly: one entry for each Squad Member in the
 * input and no one else, each with 1 to `MAX_POINTS` points within
 * `MAX_POINT_LENGTH`. Exported for unit tests.
 */
export function coachingWriteups(
  output: unknown,
  playerIds: readonly string[],
): WriteupDraft[] {
  if (!hasExactly(output, ["notes"]) || !Array.isArray(output.notes)) {
    return [];
  }
  const drafts = new Map<string, WriteupDraft>();
  for (const note of output.notes) {
    if (
      !hasExactly(note, ["playerId", "points"]) ||
      typeof note.playerId !== "string" ||
      !playerIds.includes(note.playerId) ||
      drafts.has(note.playerId) ||
      !Array.isArray(note.points)
    ) {
      return [];
    }
    const points = note.points.map((point: unknown) =>
      typeof point === "string" ? point.replace(/\s+/g, " ").trim() : "",
    );
    if (
      points.length === 0 ||
      points.length > MAX_POINTS ||
      points.some((p) => !p || p.length > MAX_POINT_LENGTH)
    ) {
      return [];
    }
    drafts.set(note.playerId, {
      kind: "coaching",
      subjectKey: note.playerId,
      text: points.join(POINT_SEPARATOR),
    });
  }
  return drafts.size === playerIds.length ? [...drafts.values()] : [];
}

function outputSchema(playerIds: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["notes"],
    properties: {
      notes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["playerId", "points"],
          properties: {
            playerId: { type: "string", enum: [...playerIds] },
            points: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

function briefInput(brief: PlayerCoachingBrief) {
  const { ready, improving, dropping } = brief.recentChanges;
  return {
    playerId: brief.playerId,
    name: brief.name,
    thisWeek: {
      totals: totalsInput(brief.weekTotals),
      appearances: brief.week.map(appearanceInput),
    },
    recentChanges: ready
      ? {
          improving: improving.map(changeInput),
          droppingOff: dropping.map(changeInput),
        }
      : "Not enough Appearances yet to compare",
    form: brief.formIndicator
      ? `${brief.formIndicator.status === "hot" ? "Well above" : "Well below"} their usual ratings: ${brief.formIndicator.text}`
      : "Rating close to their usual",
    byPositionGroup: brief.byPositionGroup.map((totals) => ({
      positionGroup: totals.positionGroup ?? "Unknown",
      ...totalsInput(totals),
    })),
    inWinsAgainstTheRest: {
      inWins: totalsInput(brief.outcomeSplit.wins),
      inDrawsAndDefeats: totalsInput(brief.outcomeSplit.dropped),
    },
    allTime: totalsInput(brief.allTime),
  };
}

function changeInput(change: { text: string; smallSample: boolean }) {
  const text = proseLabels(change.text);
  return change.smallSample
    ? { change: text, smallSample: true }
    : { change: text };
}

function appearanceInput(a: SquadAppearance) {
  return {
    date: formatLondonDate(a.playedAt, a.playedAt),
    matchType: a.matchType,
    ...resultInput({ ...a, opponent: { name: a.opponentName } }),
    positionGroup: a.positionGroup ?? "Unknown",
    ...appearanceStatsInput(a),
  };
}

function totalsInput(totals: PlayerTotals) {
  return {
    appearances: totals.appearances,
    minutes: totals.minutes,
    goals: totals.goals,
    assists: totals.assists,
    shots: totals.shots,
    averageRating: formatDecimal(totals.averageRating),
    manOfTheMatch: totals.manOfTheMatch,
    passPercentage: formatPercentage(totals.passPercentage),
    tacklePercentage: formatPercentage(totals.tacklePercentage),
    goalsPer90: formatDecimal(totals.goalsPer90, 2),
    assistsPer90: formatDecimal(totals.assistsPer90, 2),
    shotsPer90: formatDecimal(totals.shotsPer90, 2),
  };
}
