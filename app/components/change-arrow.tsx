import type { ChangeDirection } from "~/stats/recent-change";

type ChangeArrowProps = {
  direction: ChangeDirection;
  /**
   * Whether the change is good for us, when that differs from its direction
   * (fewer goals conceded is a ▼ in `win`). Defaults to up being good.
   */
  good?: boolean;
  /** Its size, e.g. `text-xs`. */
  className?: string;
};

/** A decorative ▲ or ▼, in `win` when good and `loss` when not: always pair it with words that say the same. */
export function ChangeArrow({
  direction,
  good = direction === "up",
  className = "",
}: ChangeArrowProps) {
  return (
    <span
      aria-hidden
      className={`${className} ${good ? "text-win" : "text-loss"}`}
    >
      {direction === "up" ? "▲" : "▼"}
    </span>
  );
}
