import type { Writeup } from "~/ai/writeups";
import { AiWriteup, SectionHeading } from "~/components";

/**
 * "Player summary" (CLUBS-94): how a Squad Member plays, in words, from
 * every recorded Match. Rewritten after a week they played in; hidden
 * before the first one.
 */
export function PlayerSummary({
  name,
  summary,
}: {
  name: string;
  summary: Writeup | null;
}) {
  if (!summary) return null;
  return (
    <section aria-label="Player summary" className="mb-8">
      <SectionHeading
        title="Player summary"
        subtitle={`How ${name} plays, from every match on record. The filters don't change this.`}
      />
      <AiWriteup
        label="Player summary"
        text={summary.text}
        writtenAt={summary.writtenAt}
      />
    </section>
  );
}
