/**
 * Match headlines (CLUBS-43): a one-line tabloid headline per Match. New
 * Sessions get theirs from the Session writer's call, beside each Match
 * report; this writer is the backlog, one cheap headline-only call per
 * Session for Matches that have a report but no headline.
 */
import { clampText } from "~/lib/text";
import {
  getMatchDetails,
  groupSessions,
  isPlayedAppearance,
  listKickoffs,
  type MatchDetail,
} from "~/stats";

import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptClub, promptName } from "../sanitise";
import { hasExactly } from "../validate";
import { recentWriteups, writtenSubjects } from "../writeups";
import { resultInput } from "./inputs";

/** The longest headline shown, in characters. */
export const MAX_HEADLINE_LENGTH = 80;

/** How a headline is written, shared by both prompts that ask for one. */
export const HEADLINE_RULES = `A headline is one line of at most ${MAX_HEADLINE_LENGTH} characters in the voice of a British tabloid back page, e.g. "Kabeeble sinks sorry Sparrows" or "Bloos bail as Mucky Mayhem run riot". No full stop at the end. Any score is winner first. Only facts in the data, names exactly as written there, and no slurs. Light banter about the Opponent's club name is fine. Every headline needs its own verb and its own joke: never lean on "double" or "brace", and never repeat a recent headline's pattern.`;

/** How many recent headlines a headline call sees, so it doesn't repeat them. */
export const RECENT_HEADLINES = 15;

/**
 * A headline as stored: on one line, and cut to `MAX_HEADLINE_LENGTH` with
 * an ellipsis rather than shown past it. Exported for unit tests.
 */
export function headlineText(raw: string): string {
  return clampText(raw.replace(/\s+/g, " ").trim(), MAX_HEADLINE_LENGTH);
}

export const headlineWriter: AiWriter = {
  kind: "headline",

  // A Match report only exists once its Session is over.
  async subjects(db) {
    const [kickoffs, reported, headlined] = await Promise.all([
      listKickoffs(db),
      writtenSubjects(db, "match"),
      writtenSubjects(db, "headline"),
    ]);
    return groupSessions(kickoffs)
      .reverse()
      .map((session) => ({
        subjectKey: session.id,
        version: session.matchIds
          .filter((id) => reported.has(id) && !headlined.has(id))
          .join(","),
      }))
      .filter((subject) => subject.version !== "");
  },

  async task(db, subject) {
    const [matches, recent] = await Promise.all([
      getMatchDetails(db, subject.version.split(",")),
      recentWriteups(db, "headline", RECENT_HEADLINES),
    ]);
    return matches.length > 0 ? headlineTask(subject, matches, recent) : null;
  },
};

const INSTRUCTIONS = `Write a headline for each Match in the data, using its matchId, in "headlines".
${HEADLINE_RULES}`;

/** The headline-only task for some of a Session's Matches. Exported for unit tests. */
export function headlineTask(
  { subjectKey, version }: Subject,
  matches: readonly MatchDetail[],
  recentHeadlines: readonly string[] = [],
): GenerateTask {
  const matchIds = matches.map((m) => m.matchId);
  return {
    kind: "headline",
    subjectKey,
    version,
    prompt: {
      system: HOUSE_STYLE,
      ...(recentHeadlines.length > 0 && {
        context: { recentWriting: { headlines: recentHeadlines } },
      }),
      instructions: INSTRUCTIONS,
    },
    input: { matches: matches.map(matchInput) },
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["headlines"],
      properties: {
        headlines: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["matchId", "headline"],
            properties: {
              matchId: { type: "string", enum: matchIds },
              headline: { type: "string" },
            },
          },
        },
      },
    },
    writeups: (output) => headlineWriteups(output, matchIds),
  };
}

/**
 * The headlines in a reply, or none unless it fits the schema exactly: no
 * unexpected fields, and at most one headline for each of these Matches.
 * Exported for unit tests.
 */
export function headlineWriteups(
  output: unknown,
  matchIds: readonly string[],
): WriteupDraft[] {
  if (!hasExactly(output, ["headlines"]) || !Array.isArray(output.headlines)) {
    return [];
  }
  const drafts: WriteupDraft[] = [];
  for (const item of output.headlines) {
    if (
      !hasExactly(item, ["matchId", "headline"]) ||
      typeof item.matchId !== "string" ||
      !matchIds.includes(item.matchId) ||
      drafts.some((d) => d.subjectKey === item.matchId) ||
      typeof item.headline !== "string"
    ) {
      return [];
    }
    drafts.push(headlineDraft(item.matchId, item.headline));
  }
  return drafts;
}

/** A Match's headline write-up. */
export function headlineDraft(matchId: string, headline: string): WriteupDraft {
  return {
    kind: "headline",
    subjectKey: matchId,
    text: headlineText(headline),
  };
}

/** What a headline needs: the result and who made it. */
function matchInput(match: MatchDetail) {
  const played = match.appearances.filter(isPlayedAppearance);
  const ours = played.filter((a) => a.isOurClub);
  const motm = played.find((a) => a.manOfTheMatch);
  return {
    matchId: match.matchId,
    matchType: match.matchType,
    ...resultInput(match),
    ourScorers: ours
      .filter((a) => a.goals > 0)
      .map((a) => ({ name: promptName(a.name), goals: a.goals })),
    manOfTheMatch: motm && {
      name: promptName(motm.name),
      club: promptClub(motm.isOurClub, match.opponent.name),
    },
  };
}
