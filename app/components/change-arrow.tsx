import type { ChangeDirection } from "~/stats/recent-change";

type ChangeArrowProps = {
  direction: ChangeDirection;
  /** Its size, e.g. `text-xs`. */
  className?: string;
};

/** A decorative ▲ in `win` or ▼ in `loss`: always pair it with words that say the same. */
export function ChangeArrow({ direction, className = "" }: ChangeArrowProps) {
  const up = direction === "up";
  return (
    <span
      aria-hidden
      className={`${className} ${up ? "text-win" : "text-loss"}`}
    >
      {up ? "▲" : "▼"}
    </span>
  );
}
