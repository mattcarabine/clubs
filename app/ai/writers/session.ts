/**
 * The first writer (CLUBS-35): once a Session is over, one call writes its
 * recap, a short report on each of its Matches and, for the newest Session,
 * the State of the club. A Match joining the Session later changes its
 * version, so the recap is written again.
 */
import { OUTCOME_LABEL } from "~/lib/domain";
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
  type RecordSummary,
  type SessionBrief,
} from "~/stats";

import type { GenerateTask, WriteupDraft } from "../generate";
import type { Subject } from "../plan";
import { HOUSE_STYLE } from "../prompts";
import type { AiWriter } from "../queue";
import { CLUB_SUBJECT } from "../writeups";

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
      version: session.matchIds.join(","),
      withClub: i === 0,
    }));
  },

  async task(db, subject) {
    const brief = await getSessionBrief(db, subject.subjectKey);
    return brief && sessionTask(brief, subject);
  },
};

const INSTRUCTIONS = `Write about the Session in the data, which has just finished.
- "recap": the Session recap, two to four short paragraphs. Lead with the story of the night, then the standout Squad Members (measured against their baselines in the background, e.g. a best rating in a month) and what went wrong in any Dropped Points.
- "matchReports": one report per Match, two to four sentences each, using its matchId.`;

const CLUB_INSTRUCTIONS = `
- "stateOfTheClub": the State of the club after this Session, two to four short paragraphs: form, what separates our Wins from our Dropped Points (the findings), how we respond to results, and who is carrying the Squad.`;

/** The task for one Session, from its brief. Exported for unit tests. */
export function sessionTask(
  brief: SessionBrief,
  { subjectKey, version, withClub }: SessionSubject,
): GenerateTask {
  const matchIds = brief.matches.map((m) => m.matchId);
  return {
    kind: "session",
    subjectKey,
    version,
    prompt: {
      system: HOUSE_STYLE,
      context: { squadBaselines: brief.baselines.map(baselineInput) },
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
        name: row.name,
        ...totalsInput(row),
      })),
      ...(withClub && { club: clubInput(brief.club) }),
    },
    schema: outputSchema(matchIds, withClub),
    writeups: (output) => sessionWriteups(output, subjectKey, matchIds),
  };
}

/** The write-ups in a reply, skipping anything off-schema. Exported for unit tests. */
export function sessionWriteups(
  output: unknown,
  sessionId: string,
  matchIds: readonly string[],
): WriteupDraft[] {
  if (!isRecord(output)) return [];
  const drafts: WriteupDraft[] = [];
  if (typeof output.recap === "string") {
    drafts.push({ kind: "session", subjectKey: sessionId, text: output.recap });
  }
  const reported = new Set<string>();
  for (const report of Array.isArray(output.matchReports)
    ? output.matchReports
    : []) {
    if (
      isRecord(report) &&
      typeof report.matchId === "string" &&
      typeof report.report === "string" &&
      matchIds.includes(report.matchId) &&
      !reported.has(report.matchId)
    ) {
      reported.add(report.matchId);
      drafts.push({
        kind: "match",
        subjectKey: report.matchId,
        text: report.report,
      });
    }
  }
  if (typeof output.stateOfTheClub === "string") {
    drafts.push({
      kind: "club",
      subjectKey: CLUB_SUBJECT,
      text: output.stateOfTheClub,
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
          required: ["matchId", "report"],
          properties: {
            matchId: { type: "string", enum: [...matchIds] },
            report: text,
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
    opponent: match.opponent.name,
    score: `${match.goalsFor}-${match.goalsAgainst}`,
    result: OUTCOME_LABEL[match.outcome],
    dnf: match.dnf,
    ourSkillRating: match.skillRatings.ours,
    opponentRating: match.skillRatings.opponent,
    // Why we dropped points: this Match against our typical Win.
    againstATypicalWin: match.droppedPoints?.deviations.map((d) => d.text),
    appearances: match.appearances.map((a) => ({
      club: a.isOurClub ? "A Bloo Bloo" : match.opponent.name,
      name: a.name,
      positionGroup: a.positionGroup,
      minutes: Math.round(a.secondsPlayed / 60),
      goals: a.goals,
      assists: a.assists,
      shots: a.shots,
      passes: `${a.passesMade}/${a.passAttempts}`,
      tackles: `${a.tacklesMade}/${a.tackleAttempts}`,
      rating: formatDecimal(a.rating),
      manOfTheMatch: a.manOfTheMatch,
      ...(a.saves > 0 && { saves: a.saves }),
      ...(a.redCards > 0 && { redCards: a.redCards }),
    })),
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

function baselineInput(baseline: PlayerBaseline) {
  const per90s = (totals: PlayerTotals | null) =>
    totals && {
      ...totalsInput(totals),
      goalsPer90: formatDecimal(totals.goalsPer90, 2),
      assistsPer90: formatDecimal(totals.assistsPer90, 2),
    };
  return {
    name: baseline.name,
    beforeThisSession: per90s(baseline.allTime) ?? "Debut",
    last30Days: per90s(baseline.recent),
    bestRatingBefore: formatDecimal(baseline.bestRating),
    bestRatingLast30Days: formatDecimal(baseline.bestRecentRating),
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
          finding: f.text,
          matches: f.counts,
          smallSample: f.smallSample,
        }))
      : "Not enough Wins and Dropped Points yet to compare",
    afterAResult: club.split.afterResult
      .filter((split) => split.comparable)
      .map((split) => ({
        scope: split.label,
        winPercentageAfterAWin: formatPercentage(split.afterWin.winPercentage),
        winPercentageAfterDroppedPoints: formatPercentage(
          split.afterDropped.winPercentage,
        ),
      })),
    squad: club.squad.map((row) => ({
      name: row.name,
      ...totalsInput(row),
      form: row.formIndicator?.status ?? null,
    })),
    recentSessions: club.recentSessions.map((s) => ({
      date: formatLondonDate(s.start, s.start),
      ...recordInput(s.record),
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
