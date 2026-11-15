import { useState } from "react";

import type { Writeup } from "~/ai/writeups";
import { AiWriteup, Chip, SectionHeading } from "~/components";
import type { PositionGroup } from "~/lib/domain";

/** One Position Group's summary. */
export interface PositionSummary extends Writeup {
  positionGroup: PositionGroup;
}

/**
 * "Player summary" (CLUBS-94): how a Squad Member plays, in words, from
 * every recorded Match, one per Position Group they have played enough in.
 * `summaries` lead with their Main Position, which shows first; chips pick
 * another. Rewritten after a week they played in; hidden before the first.
 */
export function PlayerSummary({
  name,
  summaries,
}: {
  name: string;
  summaries: readonly PositionSummary[];
}) {
  const [picked, setPicked] = useState<PositionGroup | null>(null);
  const shown =
    summaries.find((s) => s.positionGroup === picked) ?? summaries[0];
  if (!shown) return null;
  const position = shown.positionGroup.toLowerCase();
  return (
    <section aria-label="Player summary" className="mb-8">
      <SectionHeading
        title="Player summary"
        subtitle={`How ${name} plays as a ${position}, from every match on record. The filters don't change this.`}
        aside={
          summaries.length > 1 && (
            <fieldset>
              <legend className="sr-only">Position to read about</legend>
              <div className="flex flex-wrap gap-1">
                {summaries.map(({ positionGroup }) => (
                  <Chip
                    key={positionGroup}
                    pressed={positionGroup === shown.positionGroup}
                    onClick={() => setPicked(positionGroup)}
                  >
                    {positionGroup}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )
        }
      />
      <AiWriteup
        label={`Player summary as a ${position}`}
        text={shown.text}
        writtenAt={shown.writtenAt}
      />
    </section>
  );
}
