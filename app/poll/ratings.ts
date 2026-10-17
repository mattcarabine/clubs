/**
 * Skill Ratings on Matches: the D1 half (the Opponents to ask EA about are
 * picked in `./rating-targets.ts`).
 *
 * - A Match played within `RATING_WINDOW_MS` gets our latest Snapshot's Skill
 *   Rating when it is recorded, and the Opponent Rating from the first Poll in
 *   the window whose Opponents request succeeds.
 * - An older Match never rated (recorded before ratings were captured, or
 *   first seen after the window) is backfilled with the Opponent's current
 *   rating and our Snapshot nearest the Match (the earliest, for Matches
 *   before the first Poll). Our rating marks it done, so the backfill runs
 *   once per Match, even when EA no longer knows the Opponent.
 *
 * Every write is a single statement whose parameters are JSON strings, so it
 * stays within D1's 100 bound parameters however many Opponents are rated.
 */
import {
  and,
  desc,
  gte,
  isNotNull,
  isNull,
  lt,
  max,
  type SQL,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Db } from "../db/client.ts";
import { matches } from "../db/schema.ts";
import { OPPONENT_RATINGS_VARIANT } from "../ea/endpoints.ts";
import { parseSkillRatings } from "../ea/parse.ts";
import type { CollectedResponse } from "./collect.ts";
import {
  BACKFILL_OPPONENTS_PER_POLL,
  RATING_WINDOW_MS,
  type RatingState,
} from "./rating-targets.ts";

/** Our Club's Skill Rating Snapshots: `clubs/overallStats`, our entry. */
function ourRatingSnapshots(ourClubId: string): SQL {
  return sql`FROM snapshots
    WHERE snapshots.source = 'clubs/overallStats'
      AND snapshots.subject = 'club'
      AND snapshots.subject_key = ${ourClubId}
      AND json_extract(snapshots.stats, '$.skillRating') IS NOT NULL`;
}

/** Our Club's Skill Rating from the first of its Snapshots in `orderBy`'s order. */
function ourRating(ourClubId: string, orderBy: SQL): SQL {
  return sql`(SELECT json_extract(snapshots.stats, '$.skillRating') ${ourRatingSnapshots(ourClubId)} ORDER BY ${orderBy} LIMIT 1)`;
}

/** Read before the Poll's requests: which Opponents still need rating. */
export async function ratingState(
  db: Db,
  ourClubId: string,
  now: number,
): Promise<RatingState> {
  const windowStart = new Date(now - RATING_WINDOW_MS);
  const [rated, backfill] = await Promise.all([
    db
      .select({ matchId: matches.matchId })
      .from(matches)
      .where(
        and(
          gte(matches.playedAt, windowStart),
          isNotNull(matches.opponentSkillRating),
        ),
      ),
    db
      .select({ clubId: matches.opponentClubId })
      .from(matches)
      .where(
        and(
          isNull(matches.ourSkillRating),
          lt(matches.playedAt, windowStart),
          // Without a rating of ours to pair it with, a backfill would never finish.
          sql`EXISTS (SELECT 1 ${ourRatingSnapshots(ourClubId)})`,
        ),
      )
      .groupBy(matches.opponentClubId)
      .orderBy(desc(max(matches.playedAt)))
      .limit(BACKFILL_OPPONENTS_PER_POLL),
  ]);
  return {
    ratedMatchIds: new Set(rated.map((row) => row.matchId)),
    backfillOpponents: backfill.map((row) => row.clubId),
  };
}

/**
 * Statements that rate Matches from this Poll. They run after the Poll's
 * Match and Snapshot inserts in the same batch, so they see both.
 */
export function ratingStatements(
  db: Db,
  responses: readonly CollectedResponse[],
  ourClubId: string,
  { matchesAdded, now }: { matchesAdded: number; now: number },
): BatchItem<"sqlite">[] {
  const statements: BatchItem<"sqlite">[] = [];
  if (matchesAdded > 0) {
    statements.push(
      db
        .update(matches)
        .set({
          ourSkillRating: ourRating(
            ourClubId,
            sql`snapshots.taken_at DESC, snapshots.id DESC`,
          ),
        })
        .where(
          and(
            isNull(matches.ourSkillRating),
            gte(matches.playedAt, new Date(now - RATING_WINDOW_MS)),
          ),
        ),
    );
  }

  const opponents = responses.find(
    ({ request, response }) =>
      request.variant === OPPONENT_RATINGS_VARIANT && response.ok,
  );
  if (!opponents?.response.ok) return statements;
  const requested = [opponents.request.query.clubIds ?? []].flat();
  const ratings = parseSkillRatings(opponents.response.json);
  const ratingsJson = JSON.stringify(
    Object.fromEntries(
      requested.flatMap((id) => {
        const rating = ratings.get(id);
        return rating === undefined ? [] : [[id, rating]];
      }),
    ),
  );
  const ratingOf = sql`(SELECT value FROM json_each(${ratingsJson}) WHERE key = "matches"."opponent_club_id")`;
  const windowStart = new Date(opponents.fetchedAt - RATING_WINDOW_MS);
  const requestedClub = sql`"matches"."opponent_club_id" IN (SELECT value FROM json_each(${JSON.stringify(requested)}))`;

  statements.push(
    // Recent Matches: the rating at the time, retried until the window closes.
    db
      .update(matches)
      .set({ opponentSkillRating: ratingOf })
      .where(
        and(
          isNull(matches.opponentSkillRating),
          gte(matches.playedAt, windowStart),
          requestedClub,
        ),
      ),
    // Backfill: the current rating, and our Snapshot nearest the Match.
    db
      .update(matches)
      .set({
        opponentSkillRating: sql`coalesce("matches"."opponent_skill_rating", ${ratingOf})`,
        ourSkillRating: ourRating(
          ourClubId,
          sql`abs(snapshots.taken_at - "matches"."played_at"), snapshots.id`,
        ),
      })
      .where(
        and(
          isNull(matches.ourSkillRating),
          lt(matches.playedAt, windowStart),
          requestedClub,
        ),
      ),
  );
  return statements;
}
