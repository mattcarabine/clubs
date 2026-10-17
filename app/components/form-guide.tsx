import { OUTCOME_LABEL, type Outcome } from "~/lib/domain";
import { OutcomeBadge } from "./outcome-badge";

type FormGuideProps = {
  /** Oldest first; the last entry is the most recent Match and is underlined. */
  results: readonly Outcome[];
  size?: "sm" | "md";
};

/** W/D/L run of recent results, read left to right like a broadcast form strip. */
export function FormGuide({ results, size = "sm" }: FormGuideProps) {
  if (results.length === 0) return null;
  const summary = results.map((r) => OUTCOME_LABEL[r]).join(", ");

  return (
    <ol
      aria-label={`Form, oldest to newest: ${summary}`}
      className="flex flex-wrap items-start gap-1"
    >
      {results.map((outcome, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: a form run is positional
          key={i}
          aria-hidden
          className={`flex flex-col gap-0.5 ${i === results.length - 1 ? "after:h-0.5 after:bg-ink" : ""}`}
        >
          <OutcomeBadge outcome={outcome} size={size} />
        </li>
      ))}
    </ol>
  );
}
