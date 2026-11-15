import { formatPercentage } from "~/lib/number-format";

import { MAX_SERIES, SERIES_COLORS } from "./chart-frame";

type MixBarProps = {
  /** What is shared out: "Pass direction". */
  label: string;
  /** Shares of 100, in a fixed order; four at most. */
  parts: readonly { label: string; share: number }[];
  /** What the shares divide, after the label: "of 214 passes". */
  note?: string;
};

/**
 * One 100% bar cut into a few named shares (CLUBS-85), e.g. passes forward,
 * sideways and backward. Each share is named with its figure under the bar,
 * so the colours only tie the two together. Static: no tooltip.
 */
export function MixBar({ label, parts, note }: MixBarProps) {
  const shown = parts.slice(0, MAX_SERIES);
  const summary = shown
    .map((p) => `${p.label} ${formatPercentage(p.share)}`)
    .join(", ");
  return (
    <figure className="min-w-0" data-mix={label}>
      <figcaption className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="text-ink-soft">{label}</span>
        {note && <span className="text-ink-muted text-xs">{note}</span>}
      </figcaption>
      <div
        role="img"
        aria-label={`${label}: ${summary}`}
        className="flex h-3 gap-0.5 bg-shale-800"
      >
        {shown.map((part, i) => (
          <span
            key={part.label}
            style={{
              width: `${part.share}%`,
              backgroundColor: SERIES_COLORS[i],
            }}
          />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {shown.map((part, i) => (
          <li key={part.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2"
              style={{ backgroundColor: SERIES_COLORS[i] }}
            />
            <span className="text-ink-muted">{part.label}</span>
            <span className="font-semibold text-ink">
              {formatPercentage(part.share)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
