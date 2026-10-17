import { Fragment, type ReactNode } from "react";
import { OUTCOME_LABEL, type Outcome } from "~/lib/domain";
import { monogram } from "~/lib/monogram";
import { CrestMark } from "./crest-mark";
import { OUTCOME_FILL, OutcomeBadge } from "./outcome-badge";

export type ScoreBarSide = {
  name: string;
  score: number;
  /** Paints this side in club blue, with the crest on the hero. Set it on Our Club. */
  isOurClub?: boolean;
  /** A small line under the name on the hero, e.g. the club's Skill Rating. */
  detail?: ReactNode;
};

/** One figure in the hero's stat strip, formatted, for each side. */
export type ScoreBarStat = { label: string; home: string; away: string };

type ScoreBarProps = {
  home: ScoreBarSide;
  away: ScoreBarSide;
  /** "hero" for the lead Match on a page, "compact" for lists. */
  size?: "hero" | "compact";
  /** Text in the green tab above the bar, e.g. the Match Type. */
  label?: ReactNode;
  /**
   * The rest of the Match's details. The hero joins them to the green tab as
   * one cluster ("Full time", the kick-off); compact rows show them on the right.
   */
  meta?: ReactNode[];
  /**
   * Our Club's result, along the foot of the score as an outcome rule. The
   * hero adds a status tab with the word; compact rows a W/D/L block beside
   * the score.
   */
  outcome?: Outcome;
  /** Prefixes the hero's status tab: "DNF win". */
  dnf?: boolean;
  /** Hero only: a strip of three figures for both sides under the bar. */
  stats?: ScoreBarStat[];
};

/** The hero's width cap, for anything that sits under it and should line up. */
export const HERO_WIDTH = "mx-auto w-full max-w-[60rem]";

const STYLES = {
  hero: {
    // Long names wrap onto two lines, then clamp with an ellipsis.
    name: "line-clamp-2 text-xl",
    score: "text-score sm:text-score-lg px-3 pt-3 pb-2 sm:px-6 sm:pt-5",
    panel:
      "flex-col justify-center gap-2 py-3 text-center sm:flex-row sm:gap-4 sm:py-5",
    slant: "[--slant:0.9rem] sm:[--slant:1.4rem]",
    rule: "h-1.5",
  },
  compact: {
    name: "block truncate text-lg sm:text-xl",
    score: "text-3xl px-4 py-1.5",
    panel: "py-1.5",
    slant: "[--slant:0.5rem]",
    rule: "h-1",
  },
} as const;

/**
 * A hero name's size above phone width: the shorter the name, the larger it
 * is set, so a short one fills its panel and a long one fits on two lines.
 */
function heroNameSize(name: string): string {
  if (name.length <= 12) return "sm:text-4xl lg:text-6xl";
  if (name.length <= 18) return "sm:text-4xl lg:text-5xl";
  return "sm:text-3xl lg:text-4xl";
}

/**
 * The broadcast score strip: angled team panels either side of the score,
 * cut apart by slanted seams, with Our Club's result along the score's foot.
 */
export function ScoreBar({
  home,
  away,
  size = "compact",
  label,
  meta = [],
  outcome,
  dnf = false,
  stats,
}: ScoreBarProps) {
  const s = STYLES[size];
  const hero = size === "hero";
  const details = meta.filter((item) => item != null && item !== false);

  return (
    <div className={`min-w-0 ${hero ? HERO_WIDTH : ""} ${s.slant}`}>
      <p className="sr-only">{`${home.name} ${home.score}, ${away.name} ${away.score}`}</p>
      {hero ? (
        <MetaCluster label={label} details={details} />
      ) : (
        <CompactTabRow label={label} details={details} />
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch font-display font-extrabold uppercase leading-none">
        <TeamPanel side={home} size={size} />
        <div
          // Overlaps each panel by all but a 4px seam, so the slants run parallel.
          className="clip-slant -mx-[calc(var(--slant)-0.25rem)] flex flex-col bg-shale-800 text-ink"
        >
          <div
            className={`flex flex-1 items-center justify-center gap-2 ${s.score}`}
          >
            {/* Visual only: the sentence above reads the score in order. */}
            <span
              aria-hidden
              className="flex items-center gap-[0.35ch] tabular"
            >
              <span>{home.score}</span>
              <span className="h-[0.6em] w-1 -skew-x-12 bg-ink-muted" />
              <span>{away.score}</span>
            </span>
            {outcome && !hero && <OutcomeBadge outcome={outcome} />}
          </div>
          {outcome && hero && (
            <p
              className={`clip-slant self-center px-4 pt-1 pb-0.5 text-sm tracking-wide [--slant:0.4rem] sm:text-base ${OUTCOME_FILL[outcome]}`}
            >
              {dnf
                ? `DNF ${OUTCOME_LABEL[outcome].toLowerCase()}`
                : OUTCOME_LABEL[outcome]}
            </p>
          )}
          {outcome && (
            <span
              data-testid="outcome-rule"
              className={`${s.rule} ${OUTCOME_FILL[outcome]}`}
            />
          )}
        </div>
        <TeamPanel side={away} size={size} trailing />
      </div>
      {hero && stats && stats.length > 0 && (
        <StatStrip home={home.name} away={away.name} stats={stats} />
      )}
    </div>
  );
}

type TabRowProps = {
  label?: ReactNode;
  details: ReactNode[];
};

/** The hero's slanted tab cluster: the green tab, then each detail in slate. */
function MetaCluster({ label, details }: TabRowProps) {
  if (label == null && details.length === 0) return null;
  return (
    <ul
      aria-label="Match details"
      className="flex items-stretch font-display font-extrabold text-sm uppercase leading-none tracking-wide [--slant:0.5rem] sm:text-base"
    >
      {label != null && (
        <li className="clip-slant-r flex items-center bg-rave py-1.5 pr-4 pl-3 text-shale-950">
          {label}
        </li>
      )}
      {details.map((item, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list
          key={i}
          className="clip-slant -ml-[calc(var(--slant)-0.2rem)] flex items-center whitespace-nowrap bg-shale-800 py-1.5 pr-4 pl-5 text-ink-soft first:ml-0"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A compact row's tab line: the green tab left, details right. */
function CompactTabRow({ label, details }: TabRowProps) {
  if (label == null && details.length === 0) return null;
  return (
    <div className="flex items-end justify-between gap-2">
      {label != null ? (
        <span className="clip-slant-r bg-rave py-0.5 pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem]">
          {label}
        </span>
      ) : (
        <span />
      )}
      <span className="flex items-center gap-2 pb-1 font-display font-bold text-base text-ink-soft uppercase tracking-wide">
        {details.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list
          <Fragment key={i}>{item}</Fragment>
        ))}
      </span>
    </div>
  );
}

function TeamPanel({
  side,
  size,
  trailing = false,
}: {
  side: ScoreBarSide;
  size: "hero" | "compact";
  /** The right-hand side: its mark and text mirror the left's. */
  trailing?: boolean;
}) {
  const hero = size === "hero";
  const s = STYLES[size];
  return (
    <div
      aria-hidden
      title={side.name}
      className={[
        "clip-slant flex min-w-0 px-[calc(var(--slant)+0.25rem)] text-ink",
        side.isOurClub ? "bg-sound-900" : "bg-shale-800",
        s.panel,
        panelAlignment(hero, trailing),
      ].join(" ")}
    >
      {hero && <ClubMark side={side} />}
      <div className="min-w-0">
        <span className={`${s.name} ${hero ? heroNameSize(side.name) : ""}`}>
          {side.name}
        </span>
        {hero && side.detail != null && (
          <span className="mt-1.5 block font-sans font-semibold text-ink-soft text-xs normal-case leading-tight sm:text-sm">
            {side.detail}
          </span>
        )}
      </div>
    </div>
  );
}

/** Sets a team panel against the score; the trailing side mirrors the leading one. */
function panelAlignment(hero: boolean, trailing: boolean): string {
  if (hero) {
    return trailing
      ? "items-center sm:flex-row-reverse sm:text-right"
      : "items-center sm:text-left";
  }
  return trailing
    ? "items-center justify-start text-left"
    : "items-center justify-end text-right";
}

/** The crest for Our Club; a slanted two-letter monogram for an Opponent. */
function ClubMark({ side }: { side: ScoreBarSide }) {
  if (side.isOurClub) return <CrestMark />;
  return (
    <span
      data-testid="club-monogram"
      className="clip-slant flex h-10 w-12 shrink-0 items-center justify-center bg-shale-700 text-ink text-xl [--slant:0.5rem]"
    >
      {monogram(side.name)}
    </span>
  );
}

/** The hero's broadcast stat strip: each figure with ours left and theirs right. */
function StatStrip({
  home,
  away,
  stats,
}: {
  home: string;
  away: string;
  stats: ScoreBarStat[];
}) {
  return (
    <section aria-label="Key stats" className="mt-1">
      <dl className="grid grid-cols-3 gap-1">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="grid grid-cols-2 items-baseline gap-x-2 gap-y-1 border-shale-700 border-t-2 bg-shale-900 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-5"
          >
            <dt className="col-span-2 text-center font-display font-bold text-ink-muted text-sm uppercase tracking-wide sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:text-base">
              {stat.label}
            </dt>
            <StatFigure club={home} value={stat.home} />
            <StatFigure club={away} value={stat.away} trailing />
          </div>
        ))}
      </dl>
    </section>
  );
}

function StatFigure({
  club,
  value,
  trailing = false,
}: {
  club: string;
  value: string;
  trailing?: boolean;
}) {
  return (
    <dd
      className={`font-display font-extrabold text-2xl text-ink tabular leading-none sm:row-start-1 sm:text-3xl ${trailing ? "text-right sm:col-start-3" : "sm:col-start-1"}`}
    >
      <span className="sr-only">{`${club} `}</span>
      {value}
    </dd>
  );
}
