import { type ChoiceBarRow, ChoiceBars } from "~/components";
import { capitalise } from "~/lib/text";
import type { PlayerChoiceProfile } from "~/stats/choices";

type PlayerChoicesProps = {
  name: string;
  choices: PlayerChoiceProfile;
  /** Who the yardstick is: "typical opposing midfielder". */
  against: string;
};

/**
 * "Choices on the ball" (CLUBS-100): how EA judged a Squad Member's passes
 * and shots, as shares, over a typical opponent in their position and Our
 * Club in the Matches they played.
 */
/** The section's subtitle, naming only what the Squad Member is set beside. */
export function playerChoicesSubtitle(
  choices: PlayerChoiceProfile,
  against: string,
): string {
  const beside = [
    choices.yardstick && `a ${against}`,
    choices.team && "our club",
  ].filter(Boolean);
  return `How EA judged each of their passes and shots${
    beside.length > 0 ? `, beside ${beside.join(" and ")}` : ""
  }`;
}

export function PlayerChoices({ name, choices, against }: PlayerChoicesProps) {
  const rows: ChoiceBarRow[] = [{ id: "own", name, mix: choices.own }];
  if (choices.yardstick) {
    rows.push({
      id: "yardstick",
      name: capitalise(against),
      mix: choices.yardstick,
      // Its count is every opposing human's in that position: no figure of theirs.
      note: "The humans we played",
    });
  }
  if (choices.team) {
    rows.push({
      id: "team",
      name: "Our club",
      mix: choices.team,
      note: "In their matches",
    });
  }
  return <ChoiceBars label="Choices on the ball" groups={[{ rows }]} />;
}
