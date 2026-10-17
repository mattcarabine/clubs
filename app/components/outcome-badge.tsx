import { OUTCOME_LABEL, type Outcome } from "~/lib/domain";

const TONE: Record<Outcome, string> = {
  W: "bg-win text-shale-950",
  D: "bg-draw text-shale-950",
  L: "bg-loss text-shale-950",
};

const SIZE = {
  sm: "h-6 min-w-6 px-1 text-base",
  md: "h-8 min-w-8 px-1.5 text-xl",
} as const;

type OutcomeBadgeProps = {
  outcome: Outcome;
  size?: keyof typeof SIZE;
};

/** A single slanted W/D/L block. The letter plus an accessible label carry meaning, not colour alone. */
export function OutcomeBadge({ outcome, size = "sm" }: OutcomeBadgeProps) {
  return (
    <span
      role="img"
      aria-label={OUTCOME_LABEL[outcome]}
      title={OUTCOME_LABEL[outcome]}
      className={`clip-slant inline-flex items-center justify-center font-display font-extrabold leading-none [--slant:0.3rem] ${TONE[outcome]} ${SIZE[size]}`}
    >
      {outcome}
    </span>
  );
}
