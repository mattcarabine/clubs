/**
 * Match Events (docs/adr/0009): the unnamed counters EA sends for every player
 * in a Match, in `match_event_aggregate_0` to `_3`. Each is a comma-separated
 * list of `code:count` pairs, overflowing from one field into the next.
 *
 * EA documents none of the codes. The names here follow the community
 * research at https://github.com/Interactive-63/eafc-pro-clubs-api-research
 * (FC 27, checked against about 51,000 player rows), and only its confirmed
 * tier gets a name. Everything else stays in the stored map, unnamed, so a
 * code decoded later needs no new Poll.
 *
 * Pure and runtime-agnostic (docs/adr/0005).
 */
import type { EaPlayerStats } from "./types.ts";

/** One Appearance's Match Events: EA's code to how often it fired. */
export type MatchEvents = Readonly<Record<string, number>>;

const AGGREGATE_FIELDS = [
  "match_event_aggregate_0",
  "match_event_aggregate_1",
  "match_event_aggregate_2",
  "match_event_aggregate_3",
] as const;

const PAIR = /^(\d{1,4}):(\d{1,6})$/;

/**
 * A player's Match Events, summed across the four fields. Malformed pairs are
 * skipped, and a player with none at all gets null rather than an empty map.
 */
export function parseMatchEvents(stats: EaPlayerStats): MatchEvents | null {
  const events: Record<string, number> = {};
  for (const field of AGGREGATE_FIELDS) {
    const raw = stats[field];
    if (typeof raw !== "string" || !raw) continue;
    for (const pair of raw.split(",")) {
      const match = PAIR.exec(pair.trim());
      if (!match) continue;
      const code = String(Number(match[1]));
      events[code] = (events[code] ?? 0) + Number(match[2]);
    }
  }
  return Object.keys(events).length ? events : null;
}

/**
 * The decoded Match Events: each stat's EA code, or the codes that add up to
 * it. Confirmed tier of the research only.
 */
export const MATCH_EVENT_CODES = {
  // Shooting
  goals: [214],
  shotsOnTarget: [217],
  shotsOffTarget: [218],
  shotsOnTargetInsideBox: [13],
  shotsOnTargetOutsideBox: [18],
  shotsOffTargetInsideBox: [14],
  shotsOffTargetOutsideBox: [19],
  shotsSaved: [202],
  firstTimeGoals: [128],
  weakFootGoals: [131],
  // Creating
  assists: [11],
  secondAssists: [115],
  throughBallAssists: [118],
  // Passing: totals, then by direction, then by length
  passesCompleted: [215],
  passesFailed: [216],
  forwardPassesCompleted: [30],
  forwardPassesFailed: [31],
  backwardPassesCompleted: [32],
  backwardPassesFailed: [33],
  sidewaysPassesCompleted: [34],
  sidewaysPassesFailed: [35],
  shortPassesCompleted: [24],
  shortPassesFailed: [25],
  mediumPassesCompleted: [26],
  mediumPassesFailed: [27],
  longPassesCompleted: [28],
  longPassesFailed: [29],
  crossesCompleted: [36],
  crossesFailed: [37],
  throughBalls: [152],
  firstTimePasses: [143],
  switchesOfPlay: [144],
  flairPasses: [147],
  offsidePasses: [153],
  corners: [145],
  // Dribbling
  dribblesCompleted: [174],
  dribblesCarried: [97],
  defendersBeaten: [112],
  skillMoveBeats: [38],
  aerialDuelsWonAttacking: [265],
  aerialDuelsWonDefending: [266],
  // Defending
  tacklesWon: [0],
  tacklesLost: [1],
  standingTacklesWon: [229],
  slidingTacklesWon: [230],
  cleanTackles: [164],
  dangerousTackles: [163],
  interceptions: [6],
  opponentDispossessed: [158],
  crossesBlocked: [156],
  cornersConceded: [10],
  // Where the ball is won and lost
  possessionWonDefensiveThird: [108],
  possessionWonMiddleThird: [109],
  possessionWonAttackingThird: [110],
  possessionLostDefensiveThird: [105],
  possessionLostMiddleThird: [106],
  possessionLostAttackingThird: [107],
  // Discipline
  yellowCards: [95, 213],
  foulsConceded: [2, 3],
  foulsWon: [4],
  penaltiesConceded: [94],
  // Positioning and EA's on-screen feedback
  inPosition: [111],
  outOfPosition: [219],
  bestOptionTaken: [177],
  goodOptionTaken: [176],
  noGoodOption: [175],
  shouldHavePassedElsewhere: [182],
} as const satisfies Record<string, readonly number[]>;

export type MatchEventStat = keyof typeof MATCH_EVENT_CODES;

export const MATCH_EVENT_STATS = Object.keys(
  MATCH_EVENT_CODES,
) as MatchEventStat[];

/** How often a decoded stat happened in one Appearance's events; 0 when absent. */
export function matchEventCount(
  events: MatchEvents | null | undefined,
  stat: MatchEventStat,
): number {
  if (!events) return 0;
  let total = 0;
  for (const code of MATCH_EVENT_CODES[stat]) total += events[code] ?? 0;
  return total;
}
