import type { ReactNode } from "react";
import type { Outcome } from "~/lib/domain";
import { formatCount } from "~/lib/number-format";

export type HeadToHeadRecord = {
  wins: number;
  draws: number;
  losses: number;
};

type HeadToHeadBarProps = {
  ourClub: string;
  opponent: string;
  /** Our Club's record against the Opponent. */
  record: HeadToHeadRecord;
  /** "hero" for the lead strip on a page, "compact" for a smaller feature. */
  size?: "hero" | "compact";
  /** Text in the green tab above the bar, e.g. "Most played". */
  label?: ReactNode;
  /** Right-hand meta in the tab row, e.g. "6 Matches". */
  status?: ReactNode;
};

const SEGMENTS = [
  { outcome: "W", key: "wins", word: "Won", fill: "bg-win" },
  { outcome: "D", key: "draws", word: "Drawn", fill: "bg-draw" },
  { outcome: "L", key: "losses", word: "Lost", fill: "bg-loss" },
] as const satisfies readonly {
  outcome: Outcome;
  key: keyof HeadToHeadRecord;
  word: string;
  fill: string;
}[];

const STYLES = {
  hero: {
    name: "text-2xl sm:text-4xl lg:text-5xl line-clamp-2",
    count: "text-5xl sm:text-score",
    block: "min-w-16 px-5 py-2 sm:min-w-24 sm:px-7",
    pad: "px-3 py-4 sm:px-6 sm:py-5",
    slant: "[--slant:0.8rem] sm:[--slant:1.2rem]",
  },
  compact: {
    name: "text-xl sm:text-2xl truncate",
    count: "text-3xl sm:text-4xl",
    block: "min-w-14 px-4 py-1.5",
    pad: "px-3 py-2",
    slant: "[--slant:0.5rem]",
  },
} as const;

/**
 * The head-to-head strip: Our Club and an Opponent either side of three
 * outcome blocks (won, drawn, lost), over a meter showing their share. On
 * phones the clubs sit side by side with the blocks underneath.
 */
export function HeadToHeadBar({
  ourClub,
  opponent,
  record,
  size = "compact",
  label,
  status,
}: HeadToHeadBarProps) {
  const s = STYLES[size];
  const played = record.wins + record.draws + record.losses;

  return (
    <div className={`min-w-0 ${s.slant}`}>
      <p className="sr-only">
        {`${ourClub} against ${opponent}: ${formatCount(record.wins, "win", "wins")}, ${formatCount(record.draws, "draw", "draws")}, ${formatCount(record.losses, "loss", "losses")}`}
      </p>
      {(label != null || status != null) && (
        <div className="flex items-end justify-between gap-2">
          {label != null ? (
            <span className="clip-slant-r bg-rave py-0.5 pr-5 pl-3 font-display font-extrabold text-base text-shale-950 uppercase tracking-wide [--slant:0.6rem]">
              {label}
            </span>
          ) : (
            <span />
          )}
          <span className="pb-1 font-display font-bold text-base text-ink-soft uppercase tracking-wide">
            {status}
          </span>
        </div>
      )}
      {/* Visual only: the sentence above reads the record in order. */}
      <div aria-hidden>
        <div className="grid grid-cols-2 font-display font-extrabold uppercase leading-none sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <span
            className={`clip-slant-l flex min-w-0 items-center justify-end bg-sound-900 text-right text-ink ${s.pad}`}
          >
            <span className={s.name}>{ourClub}</span>
          </span>
          <span className="col-span-2 row-start-2 flex sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:-mx-[calc(var(--slant)/2)]">
            {SEGMENTS.map((segment) => (
              <span
                key={segment.key}
                className={`clip-slant flex flex-1 flex-col items-center justify-center gap-1 text-shale-950 tabular ${segment.fill} ${s.block}`}
              >
                <span className={s.count}>{record[segment.key]}</span>
                <span className="font-bold text-sm tracking-wide">
                  {segment.word}
                </span>
              </span>
            ))}
          </span>
          <span
            className={`clip-slant-r flex min-w-0 items-center justify-start bg-shale-800 text-left text-ink-soft ${s.pad}`}
          >
            <span className={s.name}>{opponent}</span>
          </span>
        </div>
        {played > 0 && (
          <span className="mt-1 flex h-1.5 gap-0.5">
            {SEGMENTS.filter((segment) => record[segment.key] > 0).map(
              (segment) => (
                <span
                  key={segment.key}
                  className={segment.fill}
                  style={{ flexGrow: record[segment.key] }}
                />
              ),
            )}
          </span>
        )}
      </div>
    </div>
  );
}
