/**
 * Points a built Match at a different Opponent. The match builders clone one
 * recorded Match, so every Match they build is against the same club; wrap a
 * builder in `against` to spread Matches across several Opponents.
 *
 *   await fakeEa.addMatch(against(OTHER_CLUB, win()));
 */
import type { AddMatchBody } from "../fake-ea/control.ts";
import { OUR_CLUB_ID } from "./match-builders.ts";

export interface OpponentClub {
  clubId: string;
  name: string;
}

export function against(
  club: OpponentClub,
  { matchType, match }: AddMatchBody,
): AddMatchBody {
  const clubs = rekeyOpponent(match.clubs, club.clubId);
  const opponent = clubs[club.clubId];
  clubs[club.clubId] = {
    ...opponent,
    details: {
      ...opponent.details,
      name: club.name,
      clubId: Number(club.clubId),
    },
  };
  return {
    matchType,
    match: {
      ...match,
      clubs,
      players: rekeyOpponent(match.players, club.clubId),
      aggregate: match.aggregate && rekeyOpponent(match.aggregate, club.clubId),
    },
  };
}

/** Moves every entry not keyed by Our Club onto the given Opponent's id. */
function rekeyOpponent<T>(
  byClub: Record<string, T>,
  opponentClubId: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(byClub).map(([id, value]) => [
      id === OUR_CLUB_ID ? id : opponentClubId,
      value,
    ]),
  );
}
