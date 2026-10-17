import type { ReactNode } from "react";
import type { Outcome } from "~/lib/domain";
import { OutcomeBadge } from "./outcome-badge";

export type ScoreBarSide = {
  name: string;
  score: number;
  /** Paints this side in club blue. Set it on Our Club. */
  isOurClub?: boolean;
};

type ScoreBarProps = {
  home: ScoreBarSide;
  away: ScoreBarSide;
  /** "hero" for the lead Match on a page, "compact" for lists. */
  size?: "hero" | "compact";
  /** Text in the green tab above the bar, e.g. the Match Type. */
  label?: ReactNode;
  /** Right-hand meta in the tab row, e.g. "FT", "DNF" or a kick-off time. */
  status?: ReactNode;
  /** Our Club's result, shown as a W/D/L block at the end of the tab row. */
  outcome?: Outcome;
};

const STYLES = {
  hero: {
    // Long names wrap onto two lines, then clamp.
    name: "text-xl sm:text-4xl lg:text-5xl line-clamp-2",
    score: "text-score sm:text-score-lg px-4 sm:px-8",
    pad: "px-2 py-3 sm:px-6 sm:py-5",
    slant: "[--slant:0.9rem] sm:[--slant:1.4rem]",
  },
  compact: {
    name: "text-lg sm:text-xl truncate",
    score: "text-3xl px-4",
    pad: "px-3 py-1.5",
    slant: "[--slant:0.5rem]",
  },
} as const;

/** The broadcast score strip: angled team panels either side of a chalk score box. */
export function ScoreBar({
  home,
  away,
  size = "compact",
  label,
  status,
  outcome,
}: ScoreBarProps) {
  const s = STYLES[size];
  const hasTabRow = label != null || status != null || outcome != null;

  return (
    <div className={`min-w-0 ${s.slant}`}>
      <p className="sr-only">{`${home.name} ${home.score}, ${away.name} ${away.score}`}</p>
      {hasTabRow && (
        <div className="flex items-end justify-between gap-2">
          {label != null ? (
            <span className="clip-slant-r bg-rave py-0.5 pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem]">
              {label}
            </span>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-2 pb-1 font-display font-bold text-base text-ink-soft uppercase tracking-wide">
            {status}
            {outcome && <OutcomeBadge outcome={outcome} />}
          </span>
        </div>
      )}
      {/* Visual only: the sentence above reads the score in order. */}
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch font-display font-extrabold uppercase leading-none"
      >
        <TeamPanel side={home} align="end" className={`clip-slant-l ${s.pad}`}>
          <span className={s.name}>{home.name}</span>
        </TeamPanel>
        <div
          className={`clip-slant -mx-[calc(var(--slant)/2)] flex items-center justify-center gap-[0.4ch] bg-ink text-shale-950 tabular ${s.score}`}
        >
          <span>{home.score}</span>
          <span aria-hidden className="text-shale-600">
            –
          </span>
          <span>{away.score}</span>
        </div>
        <TeamPanel
          side={away}
          align="start"
          className={`clip-slant-r ${s.pad}`}
        >
          <span className={s.name}>{away.name}</span>
        </TeamPanel>
      </div>
    </div>
  );
}

function TeamPanel({
  side,
  align,
  className,
  children,
}: {
  side: ScoreBarSide;
  align: "start" | "end";
  className: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "flex min-w-0 items-center",
        align === "end" ? "justify-end text-right" : "justify-start text-left",
        side.isOurClub ? "bg-sound-900 text-ink" : "bg-shale-800 text-ink-soft",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
