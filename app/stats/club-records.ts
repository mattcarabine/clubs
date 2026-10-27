/**
 * Club records (CLUBS-77): Our Club's best and worst since records began, the
 * kind a real club keeps (biggest win, longest unbeaten run, highest
 * Division), at the top of the Milestones page. Pure; `club-records-query.ts`
 * feeds it every Competitive Match, oldest first, and the best Division EA's
 * leaderboard Snapshots show. Like Milestones, they ignore the `StatsFilter`.
 *
 * The rules follow the record and Streak Milestones (CLUBS-63): a run of
 * results counts a Rage Quit by its result (`CLUB_STREAKS`), while anything
 * read from the score (scorelines, scoring and clean-sheet runs,
 * giant-killings) skips one, since EA awards or cuts short its score. A tie
 * keeps the record with whoever set it first, except that a run still going
 * holds it once it draws level.
 */
import { formatThousands } from "~/lib/number-format";
import { sessionPath } from "~/lib/paths";

import { type DivisionNumber, divisionName } from "./divisions";
import type { MatchSummary } from "./matches";
import { CLUB_STREAKS, MIN_RECORD_RUN } from "./milestones";
import { groupSessions } from "./sessions";

export type ClubRecordId =
  | "highest-division"
  | "highest-skill-rating"
  | "win-run"
  | "unbeaten-run"
  | "biggest-win"
  | "most-goals"
  | "session-wins"
  | "scoring-run"
  | "clean-sheet-run"
  | "giant-killing"
  | "heaviest-defeat"
  | "winless-run";

/** When a record was set: one moment, one day, or the run's first and last kick-offs. */
export type RecordWhen =
  | { kind: "moment"; at: Date }
  | { kind: "day"; at: Date }
  | { kind: "span"; from: Date; to: Date };

export interface ClubRecord {
  id: ClubRecordId;
  /** "Biggest win". */
  label: string;
  /** The big figure: "5–1", "7", "Div 3". */
  figure: string;
  /** A line under it: "v Some Club", "wins in a row". */
  note: string;
  when: RecordWhen | null;
  /** The Match or Session it was set in, when there is one. */
  href: string | null;
  /** A run that hasn't ended yet. */
  ongoing: boolean;
  /** One of the club's low points (a heaviest defeat), shown in the loss colour. */
  low: boolean;
}

/** The best Division seen in EA's current-season leaderboard. */
export interface DivisionHigh {
  division: DivisionNumber;
  /** When a Snapshot first showed it; null when only EA's own `bestDivision` says so. */
  reachedAt: Date | null;
}

export type RecordMatch = Pick<
  MatchSummary,
  | "matchId"
  | "playedAt"
  | "opponent"
  | "goalsFor"
  | "goalsAgainst"
  | "outcome"
  | "dnf"
  | "skillRatings"
>;

/** A run of Matches, first and last. */
interface Run {
  length: number;
  first: RecordMatch;
  last: RecordMatch;
}

/** The longest run of Matches that `keeps` going; `skips` neither extends nor ends one. */
export function longestRun(
  matches: readonly RecordMatch[],
  keeps: (m: RecordMatch) => boolean,
  skips: (m: RecordMatch) => boolean = () => false,
): (Run & { ongoing: boolean }) | null {
  let best: Run | null = null;
  let current: Run | null = null;
  for (const m of matches) {
    if (skips(m)) continue;
    if (!keeps(m)) {
      current = null;
      continue;
    }
    const run: Run = current
      ? { ...current, length: current.length + 1, last: m }
      : { length: 1, first: m, last: m };
    current = run;
    if (!best || run.length > best.length) best = run;
  }
  if (!best || best.length < MIN_RECORD_RUN) return null;
  // A run still going holds the record once level; an ended one only by beating it.
  if (current?.length === best.length) best = current;
  return { ...best, ongoing: best === current };
}

/** The first Match with the highest `score`, among those it gives a number. */
function bestMatch(
  matches: readonly RecordMatch[],
  score: (m: RecordMatch) => number | null,
): { match: RecordMatch; value: number } | null {
  let best: { match: RecordMatch; value: number } | null = null;
  for (const match of matches) {
    const value = score(match);
    if (value !== null && (!best || value > best.value))
      best = { match, value };
  }
  return best;
}

const matchPath = (m: RecordMatch) => `/matches/${m.matchId}`;
const versus = (m: RecordMatch) => `v ${m.opponent.name}`;
const scoreline = (m: RecordMatch) => `${m.goalsFor}–${m.goalsAgainst}`;
/** Its score is EA's to award, so it sets no scoreline record. */
const isRageQuit = (m: RecordMatch) => m.dnf;

function divisionFigure(division: DivisionNumber): string {
  return divisionName(division).replace("Division", "Div");
}

/**
 * Every record the data holds, highs first and the low points last. A
 * record with nothing to show yet (no rated Match, no run of two) is left
 * out, and with no Matches there are none.
 */
export function clubRecords(
  matches: readonly RecordMatch[],
  divisionHigh: DivisionHigh | null,
): ClubRecord[] {
  if (matches.length === 0) return [];
  const records: ClubRecord[] = [];
  const add = (
    id: ClubRecordId,
    label: string,
    record: Omit<ClubRecord, "id" | "label" | "ongoing" | "low"> &
      Partial<Pick<ClubRecord, "ongoing" | "low">>,
  ) => records.push({ id, label, ongoing: false, low: false, ...record });
  const scored = matches.filter((m) => !isRageQuit(m));

  const runRecord = (
    id: ClubRecordId,
    label: string,
    note: string,
    run: ReturnType<typeof longestRun>,
    low = false,
  ) => {
    if (!run) return;
    add(id, label, {
      figure: String(run.length),
      note,
      when: { kind: "span", from: run.first.playedAt, to: run.last.playedAt },
      href: null,
      ongoing: run.ongoing,
      low,
    });
  };

  if (divisionHigh) {
    add("highest-division", "Highest division", {
      figure: divisionFigure(divisionHigh.division),
      note: divisionHigh.reachedAt ? "first reached" : "EA's best",
      when: divisionHigh.reachedAt
        ? { kind: "day", at: divisionHigh.reachedAt }
        : null,
      href: null,
    });
  }

  const rating = bestMatch(matches, (m) => m.skillRatings.ours);
  if (rating) {
    add("highest-skill-rating", "Highest skill rating", {
      figure: formatThousands(rating.value),
      note: versus(rating.match),
      when: { kind: "moment", at: rating.match.playedAt },
      href: matchPath(rating.match),
    });
  }

  runRecord(
    "win-run",
    "Longest winning run",
    "wins in a row",
    longestRun(matches, (m) => CLUB_STREAKS["record-win-run"](m.outcome)),
  );
  runRecord(
    "unbeaten-run",
    "Longest unbeaten run",
    "matches unbeaten",
    longestRun(matches, (m) => CLUB_STREAKS["record-unbeaten-run"](m.outcome)),
  );

  const win = bestMatch(scored, (m) =>
    m.outcome === "W" ? m.goalsFor - m.goalsAgainst : null,
  );
  if (win) {
    add("biggest-win", "Biggest win", {
      figure: scoreline(win.match),
      note: versus(win.match),
      when: { kind: "moment", at: win.match.playedAt },
      href: matchPath(win.match),
    });
  }

  const goals = bestMatch(scored, (m) => (m.goalsFor > 0 ? m.goalsFor : null));
  if (goals) {
    add("most-goals", "Most goals in a match", {
      figure: String(goals.value),
      note: `${scoreline(goals.match)} ${versus(goals.match)}`,
      when: { kind: "moment", at: goals.match.playedAt },
      href: matchPath(goals.match),
    });
  }

  let session: {
    id: string;
    start: Date;
    played: number;
    wins: number;
  } | null = null;
  const outcomes = new Map(matches.map((m) => [m.matchId, m.outcome]));
  for (const { id, start, matchIds } of groupSessions(matches)) {
    const wins = matchIds.filter((m) => outcomes.get(m) === "W").length;
    if (!session || wins > session.wins) {
      session = { id, start, played: matchIds.length, wins };
    }
  }
  if (session && session.wins >= MIN_RECORD_RUN) {
    add("session-wins", "Most wins in a session", {
      figure: String(session.wins),
      note: `wins from ${session.played} matches`,
      when: { kind: "day", at: session.start },
      href: sessionPath(session.id),
    });
  }

  runRecord(
    "scoring-run",
    "Longest scoring run",
    "matches in a row with a goal",
    longestRun(matches, (m) => m.goalsFor > 0, isRageQuit),
  );
  runRecord(
    "clean-sheet-run",
    "Clean sheets in a row",
    "matches without conceding",
    longestRun(matches, (m) => m.goalsAgainst === 0, isRageQuit),
  );

  const giant = bestMatch(scored, ({ outcome, skillRatings: r }) => {
    if (outcome !== "W" || r.ours === null || r.opponent === null) return null;
    const gap = r.opponent - r.ours;
    return gap > 0 ? gap : null;
  });
  if (giant) {
    add("giant-killing", "Biggest giant-killing", {
      figure: scoreline(giant.match),
      note: `${versus(giant.match)}, rated ${formatThousands(giant.value)} above us`,
      when: { kind: "moment", at: giant.match.playedAt },
      href: matchPath(giant.match),
    });
  }

  const defeat = bestMatch(scored, (m) =>
    m.outcome === "L" ? m.goalsAgainst - m.goalsFor : null,
  );
  if (defeat) {
    add("heaviest-defeat", "Heaviest defeat", {
      figure: scoreline(defeat.match),
      note: versus(defeat.match),
      when: { kind: "moment", at: defeat.match.playedAt },
      href: matchPath(defeat.match),
      low: true,
    });
  }

  runRecord(
    "winless-run",
    "Longest winless run",
    "matches without a win",
    longestRun(matches, (m) => CLUB_STREAKS["record-winless-run"](m.outcome)),
    true,
  );

  return records;
}
