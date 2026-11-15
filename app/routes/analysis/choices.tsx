import { ChoiceBars, SectionHeading } from "~/components";
import { playerPath } from "~/lib/paths";
import type { ChoiceBreakdown } from "~/stats/choices";

/**
 * "Choices on the ball" (CLUBS-100): how EA judged each pass and shot in the
 * filtered Matches, as shares. Our Club beside the opponents' humans, then
 * each Squad Member, the most good or best options first, so who chooses
 * best shows whatever their share of the ball.
 */
export function ChoicesSection({ choices }: { choices: ChoiceBreakdown }) {
  return (
    <section aria-label="Choices on the ball">
      <SectionHeading
        title="Choices on the ball"
        subtitle="How EA judged every pass and shot. Squad members with the most good or best options come first, however many passes they make."
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
            rows: choices.players.map(({ playerId, name, mix }) => ({
              id: playerId,
              name,
              mix,
              to: playerPath(playerId),
            })),
          },
        ]}
      />
    </section>
  );
}
