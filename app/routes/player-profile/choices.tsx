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
export function PlayerChoices({ name, choices, against }: PlayerChoicesProps) {
  const rows: ChoiceBarRow[] = [{ id: "own", name, mix: choices.own }];
  if (choices.yardstick) {
    rows.push({
      id: "yardstick",
      name: capitalise(against),
      mix: choices.yardstick,
      // Scaled to their minutes, so its count of choices means little.
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
