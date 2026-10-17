import { SmallSampleTag, Tag } from "~/components";
import type { Finding } from "~/stats/outcome-split";

type FindingListProps = {
  findings: readonly Finding[];
};

/**
 * The top findings, ranked: a broadcast-style numbered rundown. The lead
 * finding spans the row in Our Club's blue; each one names its factor and
 * the Matches behind it, and says "Small sample" in words.
 */
export function FindingList({ findings }: FindingListProps) {
  return (
    <ol aria-label="Top findings" className="grid gap-3 lg:grid-cols-2">
      {findings.map((finding, i) => (
        <li
          key={finding.id}
          className={[
            "flex min-w-0 gap-4 border-t-2 p-4",
            i === 0
              ? "border-rave bg-sound-900 lg:col-span-2"
              : "border-shale-700 bg-shale-900",
          ].join(" ")}
        >
          <span
            aria-hidden
            className={`font-display font-extrabold text-ink-muted italic leading-none tabular ${i === 0 ? "text-score" : "text-4xl"}`}
          >
            {i + 1}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{finding.factor}</Tag>
              {finding.smallSample && <SmallSampleTag />}
            </div>
            <p
              className={`text-ink ${i === 0 ? "font-semibold text-lg sm:text-xl" : ""}`}
            >
              {finding.text}
            </p>
            <p className="text-ink-muted text-sm">{finding.counts}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
