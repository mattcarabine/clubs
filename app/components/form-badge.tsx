import { FORM_STATUS_LABEL, type FormStatus } from "~/lib/domain";

type FormBadgeProps = {
  status: FormStatus;
  /** What it compares, shown as the tooltip: "Last 5: 8.1 avg vs 7.3 usual". */
  detail: string;
  /** On phones, just the arrow, so a pinned table column stays narrow. */
  compact?: boolean;
};

const STYLE: Record<FormStatus, { colour: string; arrow: string }> = {
  hot: { colour: "bg-rave", arrow: "▲" },
  cold: { colour: "bg-cold", arrow: "▼" },
};

/**
 * Hot form or Cold form (CLUBS-40): a slanted badge with an arrow and the
 * word, never colour alone. The comparison behind it is the tooltip and is
 * read out after the word.
 */
export function FormBadge({ status, detail, compact = false }: FormBadgeProps) {
  const { colour, arrow } = STYLE[status];
  const label = FORM_STATUS_LABEL[status];
  return (
    <span
      title={detail}
      className={`clip-slant relative inline-flex h-5 shrink-0 items-center gap-1 px-2 font-display font-extrabold text-shale-950 text-xs uppercase leading-none tracking-wide [--slant:0.2rem] ${colour}`}
    >
      <span aria-hidden className="text-[0.625rem]">
        {arrow}
      </span>
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>
        {label}
      </span>
      <span className="sr-only">: {detail}</span>
    </span>
  );
}
