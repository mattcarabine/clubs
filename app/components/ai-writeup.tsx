import { paragraphs } from "~/lib/text";

import { LondonTime } from "./london-time";

type AiWriteupProps = {
  /** Plain prose; blank lines separate paragraphs. Never rendered as HTML. */
  text: string;
  /** When it was written, shown as "Filed …". */
  writtenAt: Date;
  /** Closes advice aimed at one Squad Member, e.g. "The Gaff". */
  signOff?: string;
  /** Names the piece for screen readers, e.g. "Session recap". */
  label: string;
};

/**
 * A written piece (a Session recap, a Match report, the State of the club)
 * as ordinary site copy: a lede, then paragraphs, then when it was filed.
 * It carries no label saying who or what wrote it (docs/adr/0006).
 */
export function AiWriteup({ text, writtenAt, signOff, label }: AiWriteupProps) {
  const [lede, ...rest] = paragraphs(text);
  return (
    <article
      aria-label={label}
      className="min-w-0 border-rave border-t-2 bg-shale-900 p-4 sm:p-6"
    >
      <div className="max-w-prose space-y-3 text-ink-soft leading-relaxed">
        {lede && <p className="text-ink text-lg leading-snug">{lede}</p>}
        {rest.map((paragraph, i) => (
          // Paragraphs never reorder, so their position is a stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <p key={i}>{paragraph}</p>
        ))}
        {signOff && (
          <p className="font-display font-bold text-ink text-xl uppercase italic tracking-wide">
            — {signOff}
          </p>
        )}
      </div>
      <p className="mt-4 text-ink-muted text-sm">
        Filed <LondonTime date={writtenAt} format="moment" />
      </p>
    </article>
  );
}
