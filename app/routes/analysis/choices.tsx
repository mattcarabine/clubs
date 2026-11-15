import { ChoiceBars, SectionHeading } from "~/components";
import { formatPercentage } from "~/lib/number-format";
import { playerPath } from "~/lib/paths";
import type { ChoiceBreakdown, PlayerChoices } from "~/stats/choices";

/**
 * How a Squad Member's share of good or best options sits against a typical
 * opponent in their position: "3 points above a typical opposing midfielder
 * (30%)". Where the opponents in that position made too few choices to
 * compare with, it says so; undefined when EA gave them no position.
 */
function choiceEdgeWords({
  position,
  yardstick,
  edge,
}: PlayerChoices): string | undefined {
  if (position === null) return undefined;
  const role = position.toLowerCase();
  if (!yardstick || edge === null) {
    return `too few opposing ${role}s to compare with`;
  }
  const beside = `a typical opposing ${role} (${formatPercentage(yardstick.goodOrBest)})`;
  if (edge === 0) return `level with ${beside}`;
  const points = `${Math.abs(edge)} ${Math.abs(edge) === 1 ? "point" : "points"}`;
  return `${points} ${edge > 0 ? "above" : "below"} ${beside}`;
}

/**
 * "Choices on the ball" (CLUBS-100): how EA judged each pass and shot in the
 * filtered Matches, as shares. Our Club beside the opponents' humans, then
 * each Squad Member in their Main Position, the furthest ahead of a typical
 * opponent in that position first (CLUBS-101), so who chooses best shows
 * whatever their share of the ball and wherever they play.
 */
export function ChoicesSection({ choices }: { choices: ChoiceBreakdown }) {
  return (
    <section aria-label="Choices on the ball">
      <SectionHeading
        title="Choices on the ball"
        subtitle="How EA judged every pass and shot. Each squad member is set against a typical opponent in their main position, and the one furthest ahead comes first."
      />
      <ChoiceBars
        label="Choices on the ball"
        groups={[
          {
            rows: [
              { id: "club", name: "Our club", mix: choices.club },
              ...(choices.opponents
                ? [
                    {
                      id: "opponents",
                      name: "Opponents",
                      mix: choices.opponents,
                    },
                  ]
                : []),
            ],
          },
          {
            label: "Squad members",
            rows: choices.players.map((player) => ({
              id: player.playerId,
              name: player.name,
              mix: player.mix,
              detail: choiceEdgeWords(player),
              to: playerPath(player.playerId),
            })),
          },
        ]}
      />
    </section>
  );
}
