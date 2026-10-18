/**
 * Campaigns (CLUBS-41): replays League Matches through the Clubs League rules
 * in `divisions.ts` to rebuild Our Club's Campaigns, Promotion Series,
 * Relegation Matches and Division moves. EA exposes none of this, so it is
 * reconstructed. Pure and client-safe.
 *
 * Tracking starts at the first Season start the Poll detected (Season 2 on):
 * every club then starts in Division 5 on 0 points. Matches before it are
 * not replayed, because the Division and Campaign points at that time are
 * unknown. Each later Season start resets to Division 5 again.
 *
 * Playoffs sit outside Campaigns: Playoff Matches are skipped, and once Our
 * Club plays one, League Matches stop counting until the next Season starts
 * (in the Playoffs "league matches do not affect promotion or relegation").
 */
import type { MatchType, Outcome } from "~/lib/domain";
import {
  DIVISIONS,
  type DivisionNumber,
  type DivisionRules,
  LEAGUE_RULES,
  type LeagueRules,
} from "./divisions";
import type { CampaignKickoffs, CampaignRef } from "./filter";

/** The Match fields the replay reads. */
export interface CampaignMatchInput {
  matchId: string;
  matchType: MatchType;
  playedAt: Date;
  outcome: Outcome;
}

export type CampaignMatch = Pick<
  CampaignMatchInput,
  "matchId" | "playedAt" | "outcome"
>;

export type CampaignStage = "league" | "promotion-series" | "relegation-match";

export type CampaignOutcome =
  | "promoted"
  | "series-failed"
  | "relegated"
  | "survived-relegation-match"
  /** A Season start cut the Campaign short (it reset every club to Division 5). */
  | "season-ended"
  | "in-progress";

/** How each outcome reads in the UI: always words, never colour alone. */
export const CAMPAIGN_OUTCOME_LABEL: Record<CampaignOutcome, string> = {
  promoted: "Promoted",
  "series-failed": "Promotion Series failed",
  relegated: "Relegated",
  "survived-relegation-match": "Survived Relegation Match",
  "season-ended": "Season ended",
  "in-progress": "In progress",
};

export interface Campaign {
  division: DivisionNumber;
  /** The Season start, or the kick-off of the Match that ended the previous Campaign. */
  startedAt: Date;
  /** The last Match's kick-off, or the Season start that cut it short; null while in progress. */
  endedAt: Date | null;
  startPoints: number;
  /** Campaign points now (or when it ended). */
  points: number;
  /** Points at the start, then after each League Match. */
  pointsPath: number[];
  /** Chances at the start: all of them, or fewer after drawing a Relegation Match. */
  startChances: number;
  /** League losses that cost a Chance; null where the Division can't be relegated. */
  chancesUsed: number | null;
  /** Matches before the Promotion Series or Relegation Match, oldest first. */
  leagueMatches: CampaignMatch[];
  promotionSeries: CampaignMatch[];
  relegationMatch: CampaignMatch | null;
  /** Where the Campaign is (or ended). */
  stage: CampaignStage;
  outcome: CampaignOutcome;
}

export interface CampaignReplay {
  /** Oldest first; the last is the current Campaign. Empty before tracking starts. */
  campaigns: Campaign[];
  /** Our Club has played a Playoff Match since the latest Season start. */
  inPlayoffs: boolean;
}

export interface CampaignRuleSet {
  divisions: Record<DivisionNumber, DivisionRules>;
  league: LeagueRules;
}

export const CAMPAIGN_RULES: CampaignRuleSet = {
  divisions: DIVISIONS,
  league: LEAGUE_RULES,
};

/**
 * Replays Matches (any order, any Match Type) from the tracked Season starts.
 * `seasonStarts` are the detected Season starts, never Season 1's unknown one.
 */
export function replayCampaigns(
  matches: readonly CampaignMatchInput[],
  seasonStarts: readonly Date[],
  rules: CampaignRuleSet = CAMPAIGN_RULES,
): CampaignReplay {
  const campaigns: Campaign[] = [];
  let inPlayoffs = false;

  const open = (
    division: DivisionNumber,
    points: number,
    startedAt: Date,
    startChances: number = rules.league.chances,
  ) => {
    campaigns.push({
      division,
      startedAt,
      endedAt: null,
      startPoints: points,
      points,
      pointsPath: [points],
      startChances,
      chancesUsed: rules.divisions[division].relegation ? 0 : null,
      leagueMatches: [],
      promotionSeries: [],
      relegationMatch: null,
      stage: "league",
      outcome: "in-progress",
    });
  };

  const startSeason = (at: Date) => {
    const current = campaigns.at(-1);
    if (current?.outcome === "in-progress") {
      current.outcome = "season-ended";
      current.endedAt = at;
    }
    inPlayoffs = false;
    open(
      rules.league.seasonStart.division,
      rules.league.seasonStart.points,
      at,
    );
  };

  const starts = [...seasonStarts].sort((a, b) => a.getTime() - b.getTime());
  let nextStart = 0;
  for (const match of [...matches].sort(byKickOff)) {
    while (
      nextStart < starts.length &&
      starts[nextStart].getTime() <= match.playedAt.getTime()
    ) {
      startSeason(starts[nextStart++]);
    }
    const current = campaigns.at(-1);
    if (!current) continue;
    if (match.matchType === "Playoff") inPlayoffs = true;
    if (match.matchType !== "League" || inPlayoffs) continue;

    const next = play(current, match, rules);
    if (next) open(next.division, next.points, match.playedAt, next.chances);
  }
  for (const at of starts.slice(nextStart)) startSeason(at);

  return { campaigns, inPlayoffs };
}

/** Where the next Campaign starts when this Match ends the current one. */
interface NextCampaign {
  division: DivisionNumber;
  points: number;
  chances?: number;
}

/** Plays one League Match into the Campaign; returns the next Campaign if it ended. */
function play(
  campaign: Campaign,
  match: CampaignMatchInput,
  { divisions, league }: CampaignRuleSet,
): NextCampaign | undefined {
  const rules = divisions[campaign.division];
  const { matchId, playedAt, outcome } = match;
  const played = { matchId, playedAt, outcome };
  const end = (result: CampaignOutcome, next: NextCampaign) => {
    campaign.outcome = result;
    campaign.endedAt = playedAt;
    return next;
  };

  switch (campaign.stage) {
    case "league": {
      campaign.leagueMatches.push(played);
      campaign.points += league.points[outcome];
      campaign.pointsPath.push(campaign.points);
      if (outcome === "L" && campaign.chancesUsed !== null) {
        campaign.chancesUsed += 1;
      }
      if (
        rules.pointsTarget !== null &&
        campaign.points >= rules.pointsTarget
      ) {
        campaign.stage = "promotion-series";
      } else if (chancesLeft(campaign) === 0) {
        campaign.stage = "relegation-match";
      }
      return undefined;
    }
    case "promotion-series": {
      const series = rules.promotionSeries;
      if (!series) return undefined;
      campaign.promotionSeries.push(played);
      const wins = campaign.promotionSeries.filter((m) => m.outcome === "W");
      const nonWins = campaign.promotionSeries.length - wins.length;
      if (wins.length >= series.winsNeeded) {
        return end("promoted", {
          division: (campaign.division - 1) as DivisionNumber,
          points: league.pointsAfterPromotion,
        });
      }
      if (nonWins > series.matches - series.winsNeeded) {
        return end("series-failed", {
          division: campaign.division,
          points: rules.pointsAfterFailedSeries ?? league.seasonStart.points,
        });
      }
      return undefined;
    }
    case "relegation-match": {
      campaign.relegationMatch = played;
      if (outcome === "L" && rules.relegation) {
        return end("relegated", {
          division: (campaign.division + 1) as DivisionNumber,
          points: rules.relegation.pointsInDivisionBelow,
        });
      }
      return end("survived-relegation-match", {
        division: campaign.division,
        points: campaign.points,
        chances:
          outcome === "W"
            ? league.chancesAfterRelegationWin
            : league.chancesAfterRelegationDraw,
      });
    }
  }
}

/** Chances left; null where the Division can't be relegated. */
export function chancesLeft(campaign: Campaign): number | null {
  return campaign.chancesUsed === null
    ? null
    : campaign.startChances - campaign.chancesUsed;
}

/** Wins, draws and losses in the Campaign's League Matches. */
export function campaignRecord(campaign: Campaign): {
  wins: number;
  draws: number;
  losses: number;
} {
  const count = (o: Outcome) =>
    campaign.leagueMatches.filter((m) => m.outcome === o).length;
  return { wins: count("W"), draws: count("D"), losses: count("L") };
}

export type DivisionEvent = "season-start" | "promotion" | "relegation";

/** One step of the Division timeline: the Division Our Club moved into, and why. */
export interface DivisionStep {
  at: Date;
  division: DivisionNumber;
  event: DivisionEvent;
}

/** Each Season start, Promotion and Relegation, oldest first. */
export function divisionTimeline(
  campaigns: readonly Campaign[],
): DivisionStep[] {
  return campaigns.flatMap((campaign, i): DivisionStep[] => {
    const event = divisionEvent(campaigns[i - 1]);
    if (!event) return [];
    return [{ at: campaign.startedAt, division: campaign.division, event }];
  });
}

/** Why a Campaign started, from the one before it; null when the Division stayed put. */
function divisionEvent(previous: Campaign | undefined): DivisionEvent | null {
  switch (previous?.outcome) {
    case undefined:
    case "season-ended":
      return "season-start";
    case "promoted":
      return "promotion";
    case "relegated":
      return "relegation";
    default:
      return null;
  }
}

/** The tracked Division and EA's `currentDivision`, when they disagree. */
export interface DivisionMismatch {
  tracked: DivisionNumber;
  ea: DivisionNumber;
}

/**
 * Compares the current Campaign's Division with EA's `currentDivision`.
 * Skipped during the Playoffs, when EA already shows next Season's Division.
 */
export function divisionMismatch(
  replay: CampaignReplay,
  eaDivision: DivisionNumber | null,
): DivisionMismatch | null {
  const current = replay.campaigns.at(-1);
  if (!current || eaDivision === null || replay.inPlayoffs) return null;
  return current.division === eaDivision
    ? null
    : { tracked: current.division, ea: eaDivision };
}

/**
 * The Campaign a filter's `?campaign=` names, with its number (1 is the
 * first tracked): the current one, the one before it, or one by number.
 * Undefined when there is no such Campaign.
 */
export function findCampaign(
  campaigns: readonly Campaign[],
  ref: CampaignRef,
): { number: number; campaign: Campaign } | undefined {
  const number =
    ref === "current"
      ? campaigns.length
      : ref === "previous"
        ? campaigns.length - 1
        : ref;
  const campaign = campaigns[number - 1];
  return campaign ? { number, campaign } : undefined;
}

/**
 * The kick-offs of the Campaign's first and last Match (League Matches,
 * Promotion Series and Relegation Match alike), or null before its first.
 * The League Matches between them are exactly the Campaign's, since the
 * replay hands each League Match to the Campaign in progress.
 */
export function campaignKickoffs(campaign: Campaign): CampaignKickoffs | null {
  const played = [
    ...campaign.leagueMatches,
    ...campaign.promotionSeries,
    ...(campaign.relegationMatch ? [campaign.relegationMatch] : []),
  ];
  const first = played[0];
  const last = played.at(-1);
  return first && last ? { first: first.playedAt, last: last.playedAt } : null;
}

function byKickOff(a: CampaignMatchInput, b: CampaignMatchInput): number {
  return (
    a.playedAt.getTime() - b.playedAt.getTime() ||
    a.matchId.localeCompare(b.matchId)
  );
}
