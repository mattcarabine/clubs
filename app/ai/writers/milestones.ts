/**
 * Milestone comments (CLUBS-36): one call writes a short comment on every
 * Milestone detected together (a Poll's, in one Session), so they don't all
 * read the same. Until it lands, or if it never does, pages show each
 * Milestone's plain sentence (`app/stats/milestones.ts`).
 */
import { formatLondonDateTime } from "~/lib/london-time";
import { formatDecimal } from "~/lib/number-format";
import {
  DEFAULT_STATS_FILTER,
  isCountedAppearance,
  listMilestoneBatches,
  listMilestones,
  MILESTONE_KINDS,
  type MilestoneEntry,
  milestoneHeadline,
  type SquadAppearance,
  squadAppearances,
  summariseAppearances,
} from "~/stats";
import { revised } from "../config";
import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptName } from "../sanitise";
import { hasExactly, isText } from "../validate";
import { recentWriteups } from "../writeups";
import { OUR_CLUB, resultInput } from "./inputs";

/** How many recent comments a call sees, so it doesn't repeat them. */
const RECENT_COMMENTS = 15;
const DAY_MS = 86_400_000;
/** The recent ratings a player Milestone's comment can draw on. */
const RECENT_FORM = 5;
/** The longest comment accepted, in characters. */
export const MAX_COMMENT_LENGTH = 400;

export const milestoneWriter: AiWriter = {
  kind: "milestone",

  async subjects(db) {
    return (await listMilestoneBatches(db)).map(({ batchKey, size }) => ({
      subjectKey: batchKey,
      version: revised(String(size)),
    }));
  },

  async task(db, subject) {
    const milestones = await listMilestones(db, OUR_CLUB, {
      batchKey: subject.subjectKey,
    });
    if (milestones.length === 0) return null;
    const [history, recent] = await Promise.all([
      // The DNFs we quit stay in for results; player figures skip them.
      squadAppearances(db, DEFAULT_STATS_FILTER, { includeQuitMatches: true }),
      recentWriteups(db, "milestone", RECENT_COMMENTS),
    ]);
    return milestoneTask(milestones, history, subject, recent);
  },
};

const INSTRUCTIONS = `Write a comment on each Milestone in the data: our players' landmarks and feats, and the club's landmarks and records.
- "comments": one per Milestone, using its milestoneId. One or two sentences each, in the pundit voice: why it matters, set in the Match it came in and the form and totals given. Each Milestone's headline is shown above its comment, so don't just repeat it.
- Records and personal bests only count Matches recorded since tracking began ("sinceRecordsBegan"), so never call them all-time. Say "since records began" in at most one comment of the batch, and only where it matters; elsewhere say it another way (a club best, his best yet) or leave it.
- No two comments share an opening, a structure or a stand-out phrase, and none echoes the recent comments in the background.`;

/** The task for one batch. Exported for unit tests. */
export function milestoneTask(
  milestones: readonly MilestoneEntry[],
  history: readonly SquadAppearance[],
  { subjectKey, version }: Subject,
  recentComments: readonly string[] = [],
): GenerateTask {
  const ids = milestones.map((m) => String(m.id));
  const first = history[0]?.playedAt;
  const latest = Math.max(...milestones.map((m) => m.achievedAt.getTime()));
  return {
    kind: "milestone",
    subjectKey,
    version,
    ...(first && {
      prose: { trackedDays: (latest - first.getTime()) / DAY_MS },
    }),
    prompt: {
      system: HOUSE_STYLE,
      ...(recentComments.length > 0 && {
        context: { recentWriting: { milestoneComments: recentComments } },
      }),
      instructions: INSTRUCTIONS,
    },
    input: { milestones: milestones.map((m) => milestoneInput(m, history)) },
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["comments"],
      properties: {
        comments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["milestoneId", "comment"],
            properties: {
              milestoneId: { type: "string", enum: ids },
              comment: { type: "string" },
            },
          },
        },
      },
    },
    writeups: (output) => milestoneWriteups(output, ids),
  };
}

/**
 * A comment per Milestone, or none unless the reply fits exactly: no extra
 * fields, one comment for each Milestone asked about, each within its cap.
 * Exported for unit tests.
 */
export function milestoneWriteups(
  output: unknown,
  ids: readonly string[],
): WriteupDraft[] {
  if (!hasExactly(output, ["comments"]) || !Array.isArray(output.comments)) {
    return [];
  }
  const drafts = new Map<string, WriteupDraft>();
  for (const item of output.comments) {
    if (
      !hasExactly(item, ["milestoneId", "comment"]) ||
      typeof item.milestoneId !== "string" ||
      !ids.includes(item.milestoneId) ||
      drafts.has(item.milestoneId) ||
      !isText(item.comment, MAX_COMMENT_LENGTH)
    ) {
      return [];
    }
    drafts.set(item.milestoneId, {
      kind: "milestone",
      subjectKey: item.milestoneId,
      text: item.comment,
    });
  }
  return drafts.size === ids.length ? [...drafts.values()] : [];
}

/** One Milestone as the model reads it, with what was known at its Match. */
function milestoneInput(
  m: MilestoneEntry,
  history: readonly SquadAppearance[],
) {
  const name = promptName(m.name);
  const definition = MILESTONE_KINDS[m.kind];
  const before = history.filter((a) => a.playedAt <= m.achievedAt);
  const { match } = m;
  return {
    milestoneId: String(m.id),
    headline: milestoneHeadline(m.kind, name, m),
    type: definition.category,
    sinceRecordsBegan:
      definition.category === "record" ||
      m.kind === "personal-best-rating" ||
      m.kind === "first-goal-in-position",
    value: m.value,
    ...(m.threshold !== null &&
      m.threshold !== m.value && { previousBest: m.threshold }),
    match: {
      kickOff: formatLondonDateTime(match.playedAt),
      matchType: match.matchType,
      ...resultInput(match),
    },
    ...(m.playerId
      ? {
          player: playerInput(
            name,
            m.playerId,
            m.match.matchId,
            before.filter(isCountedAppearance),
          ),
        }
      : { club: { last5Results: lastResults(before) } }),
  };
}

function playerInput(
  name: string,
  playerId: string,
  matchId: string,
  before: readonly SquadAppearance[],
) {
  const theirs = before.filter((a) => a.playerId === playerId);
  const inMatch = theirs.find((a) => a.matchId === matchId);
  const totals = summariseAppearances(theirs);
  return {
    name,
    inThisMatch: inMatch && {
      positionGroup: inMatch.positionGroup,
      goals: inMatch.goals,
      assists: inMatch.assists,
      rating: formatDecimal(inMatch.rating),
      manOfTheMatch: inMatch.manOfTheMatch,
    },
    recentRatings: theirs
      .slice(-RECENT_FORM)
      .map((a) => formatDecimal(a.rating))
      .join(", "),
    recordedSinceTrackingBegan: {
      appearances: totals.appearances,
      goals: totals.goals,
      assists: totals.assists,
      averageRating: formatDecimal(totals.averageRating),
    },
  };
}

/** Our Club's last results up to and including the Match, oldest first: "WWLDW". */
function lastResults(before: readonly SquadAppearance[]): string {
  const outcomes = new Map(before.map((a) => [a.matchId, a.outcome]));
  return [...outcomes.values()].slice(-RECENT_FORM).join("");
}
