import type { ReactNode } from "react";
import { Sparkline } from "./charts/sparkline";

export type StatDelta = {
  /** Signed text against a named period, e.g. "+0.4 vs last Season". */
  text: string;
  /** Whether the change is good for Our Club; sets the colour and arrow. */
  tone: "positive" | "negative" | "neutral";
};

type StatTileProps = {
  /** Sentence case, no trailing colon, e.g. "Goals per Match". */
  label: string;
  /** Preformatted value, e.g. "2.4" or "61%". */
  value: ReactNode;
  delta?: StatDelta;
  /** Recent values, oldest first, drawn as a sparkline. */
  trend?: readonly number[];
  /** Highlight one tile per group, e.g. the headline stat on Matchday. */
  featured?: boolean;
};

// The arrow carries the tone colour. The text does too on shale, but on the
// featured blue only `ink` passes AA, so there the arrow alone is coloured.
const DELTA_TONE = {
  positive: { text: "text-win", arrow: "text-win", glyph: "▲" },
  negative: { text: "text-loss", arrow: "text-loss", glyph: "▼" },
  neutral: { text: "text-ink-muted", arrow: "text-ink-muted", glyph: "■" },
} as const;

/** One headline number with an optional delta and sparkline. */
export function StatTile({
  label,
  value,
  delta,
  trend,
  featured = false,
}: StatTileProps) {
  return (
    <div
      className={[
        "relative flex min-w-0 flex-col gap-1 overflow-hidden border-t-2 p-4",
        featured ? "border-rave bg-sound-900" : "border-shale-700 bg-shale-900",
      ].join(" ")}
    >
      <dt className="text-ink-soft text-sm">{label}</dt>
      <dd className="font-display font-extrabold text-5xl text-ink leading-none">
        {value}
      </dd>
      {delta && (
        <dd
          className={`text-sm ${featured ? "text-ink" : DELTA_TONE[delta.tone].text}`}
        >
          <span
            aria-hidden
            className={`mr-1 text-xs ${DELTA_TONE[delta.tone].arrow}`}
          >
            {DELTA_TONE[delta.tone].glyph}
          </span>
          {delta.text}
        </dd>
      )}
      {trend && trend.length > 1 && (
        <dd className="mt-2">
          <Sparkline values={trend} label={`${label} trend`} />
        </dd>
      )}
    </div>
  );
}

/** Responsive grid for StatTiles: two up on phones, up to four on desktop. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {children}
    </dl>
  );
}
