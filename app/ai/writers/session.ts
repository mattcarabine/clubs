/**
 * The first writer (CLUBS-35): once a Session is over, one call writes its
 * recap, a short report and a headline (CLUBS-43) for each of its Matches
 * and, for the newest Session, the State of the club. A Match joining the Session later changes its
 * version, so the recap is written again.
 */
import { formatLondonDate, formatLondonTime } from "~/lib/london-time";
import { formatDecimal, formatPercentage } from "~/lib/number-format";
import {
  type BriefMatch,
  type ClubBrief,
  getSessionBrief,
  groupSessions,
  isSessionOver,
  listKickoffs,
  type PlayerBaseline,
  type PlayerTotals,
  RECENT_BASELINE_DAYS,
  type RecordSummary,
  type SessionBrief,
} from "~/stats";
import { revised } from "../config";
import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { promptName } from "../sanitise";
import { hasExactly, isText } from "../validate";
import { CLUB_SUBJECT, recentWriteups } from "../writeups";
import { HEADLINE_RULES, headlineDraft } from "./headline";
import { lineupInput, proseLabels, resultInput } from "./inputs";

interface SessionSubject extends Subject {
  /** The newest Session that is over also gets the State of the club. */
  withClub: boolean;
}

export const sessionWriter: AiWriter<SessionSubject> = {
  kind: "session",

  async subjects(db, now) {
    const over = groupSessions(await listKickoffs(db))
      .filter((session) => isSessionOver(session, now))
      .reverse();
    return over.map((session, i) => ({
      subjectKey: session.id,
      version: revised(session.matchIds.join(",")),
      withClub: i === 0,
    }));
  },

  async task(db, subject) {
    const [brief, recaps, matchReports, headlines, club] = await Promise.all([
      getSessionBrief(db, subject.subjectKey),
      recentWriteups(db, "session", RECENT_PIECES.recaps),
      recentWriteups(db, "match", RECENT_PIECES.matchReports),
      recentWriteups(db, "headline", RECENT_PIECES.headlines),
      subject.withClub ? recentWriteups(db, "club", 1) : [],
    ]);
    const recentWriting = {
      recaps,
      matchReports,
      headlines,
      ...(club.length > 0 && { stateOfTheClub: club }),
    };
    return brief && sessionTask(brief, subject, recentWriting);
  },
};

/** How many recent pieces of each kind the writer sees, so it doesn't repeat them. */
const RECENT_PIECES = { recaps: 3, matchReports: 12, headlines: 15 };

/** Recent write-ups of the kinds a Session call writes, newest first. */
export interface RecentWriting {
  recaps: string[];
  matchReports: string[];
  headlines: string[];
  stateOfTheClub?: string[];
}

const DAY_MS = 86_400_000;

const INSTRUCTIONS = `Write about the Session in the data, which has just finished.
- "recap": the Session recap, two to four short paragraphs. Tell the story of the night, then the players who stood out against their own usual numbers (their baselines are in the background) and, after any defeats or draws, what went wrong.
- "matchReports": one per Match, using its matchId: a "report" and a "headline".
- A report is two to four sentences. Build it around what made that Match different: its "angle" when it has one (its most unusual stat against our usual), a player, a turning point. No two reports in a Session share an opening or a shape.
- When a Match's "quitBy" is "us", we were outclassed and pulled the plug. Its report is one or two short, brutal sentences: the score, the minute it ended and how thoroughly we were run over. No stats about our side, no excuses, no silver linings. Say "outclassed and bailed" in a way none of the recent pieces have.
- When "quitBy" is "opponent", they gave up while we were on top: enjoy it, briefly.
- ${HEADLINE_RULES}`;

const CLUB_INSTRUCTIONS = `
- "stateOfTheClub": the State of the club after this Session, two to four short paragraphs: form, what separates our wins from our draws and defeats (the findings), how we respond to results, and who is carrying the squad.`;

/** The task for one Session, from its brief. Exported for unit tests. */
export function sessionTask(
  brief: SessionBrief,
  { subjectKey, version, withClub }: SessionSubject,
  recentWriting?: RecentWriting,
): GenerateTask {
  const matchIds = brief.matches.map((m) => m.matchId);
  const trackedDays =
    (brief.session.start.getTime() - brief.trackedSince.getTime()) / DAY_MS;
  const withRecent = trackedDays >= RECENT_BASELINE_DAYS;
  return {
    kind: "session",
    subjectKey,
    version,
    prose: { trackedDays },
    prompt: {
      system: HOUSE_STYLE,
      context: {
        squadBaselines: brief.baselines.map((b) =>
          baselineInput(b, withRecent),
        ),
        ...(recentWriting && { recentWriting }),
      },
      instructions: withClub ? INSTRUCTIONS + CLUB_INSTRUCTIONS : INSTRUCTIONS,
    },
    input: {
      session: {
        date: formatLondonDate(brief.session.start, brief.session.end),
        firstKickOff: formatLondonTime(brief.session.start),
        lastKickOff: formatLondonTime(brief.session.end),
        record: recordInput(brief.record),
        resultsBefore: brief.formBefore.join(""),
      },
      matches: brief.matches.map(matchInput),
      sessionLeaderboard: brief.leaderboard.map((row) => ({
        name: promptName(row.name),
        ...totalsInput(row),
      })),
      ...(withClub && { club: clubInput(brief.club) }),
    },
    schema: outputSchema(matchIds, withClub),
    writeups: (output) =>
      sessionWriteups(output, subjectKey, matchIds, withClub),
  };
}

/** The longest recap or State of the club accepted, in characters. */
export const MAX_PIECE_LENGTH = 4_000;
/** The longest Match report accepted. */
export const MAX_REPORT_LENGTH = 1_500;

/**
 * The write-ups in a reply, or none unless it fits the schema exactly: no
 * unexpected fields, a report only for this Session's Matches and at most
 * one each, `stateOfTheClub` only when it was asked for, and every text
 * within its length cap (a headline is cut to fit instead). Exported for
 * unit tests.
 */
export function sessionWriteups(
  output: unknown,
  sessionId: string,
  matchIds: readonly string[],
  withClub: boolean,
): WriteupDraft[] {
  const fields = withClub
    ? ["recap", "matchReports", "stateOfTheClub"]
    : ["recap", "matchReports"];
  if (!hasExactly(output, fields)) return [];
  const { recap, matchReports, stateOfTheClub } = output;
  if (!isText(recap, MAX_PIECE_LENGTH) || !Array.isArray(matchReports)) {
    return [];
  }
  const drafts: WriteupDraft[] = [
    { kind: "session", subjectKey: sessionId, text: recap },
  ];
  const reported = new Set<string>();
  for (const report of matchReports) {
    if (
      !hasExactly(report, ["matchId", "report", "headline"]) ||
      typeof report.matchId !== "string" ||
      !matchIds.includes(report.matchId) ||
      reported.has(report.matchId) ||
      !isText(report.report, MAX_REPORT_LENGTH) ||
      typeof report.headline !== "string"
    ) {
      return [];
    }
    reported.add(report.matchId);
    drafts.push(
      { kind: "match", subjectKey: report.matchId, text: report.report },
      headlineDraft(report.matchId, report.headline),
    );
  }
  if (withClub) {
    if (!isText(stateOfTheClub, MAX_PIECE_LENGTH)) return [];
    drafts.push({
      kind: "club",
      subjectKey: CLUB_SUBJECT,
      text: stateOfTheClub,
    });
  }
  return drafts;
}

function outputSchema(matchIds: readonly string[], withClub: boolean) {
  const text = { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "recap",
      "matchReports",
      ...(withClub ? ["stateOfTheClub"] : []),
    ],
    properties: {
      recap: text,
      matchReports: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["matchId", "report", "headline"],
          properties: {
            matchId: { type: "string", enum: [...matchIds] },
            report: text,
            headline: text,
          },
        },
      },
      ...(withClub && { stateOfTheClub: text }),
    },
  };
}

function matchInput(match: BriefMatch) {
  return {
    matchId: match.matchId,
    placeInSession: match.place,
    kickOff: formatLondonTime(match.playedAt),
    matchType: match.matchType,
    ...resultInput(match),
    ourSkillRating: match.skillRatings.ours,
    opponentSkillRating: match.skillRatings.opponent,
    ...(match.angle && { angle: match.angle.text }),
    // Why we dropped points: this Match against our typical Win.
    againstATypicalWin: match.droppedPoints?.deviations.map((d) =>
      proseLabels(d.text),
    ),
    ...lineupInput(match),
  };
}

function totalsInput(totals: PlayerTotals) {
  return {
    appearances: totals.appearances,
    goals: totals.goals,
    assists: totals.assists,
    shots: totals.shots,
    averageRating: formatDecimal(totals.averageRating),
    manOfTheMatch: totals.manOfTheMatch,
    passPercentage: formatPercentage(totals.passPercentage),
    tacklePercentage: formatPercentage(totals.tacklePercentage),
  };
}

/** A player's baseline; the last-30-days figures only once tracking covers 30 days. */
function baselineInput(baseline: PlayerBaseline, withRecent: boolean) {
  const per90s = (totals: PlayerTotals | null) =>
    totals && {
      ...totalsInput(totals),
      goalsPer90: formatDecimal(totals.goalsPer90, 2),
      assistsPer90: formatDecimal(totals.assistsPer90, 2),
    };
  return {
    name: promptName(baseline.name),
    beforeThisSession: per90s(baseline.allTime) ?? "Debut",
    bestRatingBefore: formatDecimal(baseline.bestRating),
    ...(withRecent && {
      last30Days: per90s(baseline.recent),
      bestRatingLast30Days: formatDecimal(baseline.bestRecentRating),
    }),
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
    points: record.points,
    winPercentage: formatPercentage(record.winPercentage),
  };
}

function clubInput(club: ClubBrief) {
  return {
    allTimeRecord: recordInput(club.record),
    last10Results: club.recentForm.join(""),
    outcomeSplitFindings: club.split.ready
      ? club.split.findings.map((f) => ({
          finding: proseLabels(f.text),
          matches: proseLabels(f.counts),
          smallSample: f.smallSample,
        }))
      : "Not enough wins and draws or defeats yet to compare",
    afterAResult: club.split.afterResult
      .filter((split) => split.comparable)
      .map((split) => ({
        scope: split.label,
        winPercentageAfterAWin: formatPercentage(split.afterWin.winPercentage),
        winPercentageAfterADrawOrDefeat: formatPercentage(
          split.afterDropped.winPercentage,
        ),
      })),
    squad: club.squad.map((row) => ({
      name: promptName(row.name),
      ...totalsInput(row),
      form: row.formIndicator
        ? `${row.formIndicator.status === "hot" ? "well above" : "well below"} their usual ratings lately`
        : null,
    })),
    recentSessions: club.recentSessions.map((s) => ({
      date: formatLondonDate(s.start, s.start),
      ...recordInput(s.record),
    })),
  };
}
