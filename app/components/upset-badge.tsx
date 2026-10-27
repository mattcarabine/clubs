import type { Expectation } from "~/stats/win-chance";

/** An Upset in words: "Upset Win", "Big upset Win", "Should have won" or "Should really have won". */
export function upsetLabel({ kind, big }: Expectation): string {
  if (kind === "upset-win") return big ? "Big upset Win" : "Upset Win";
  return big ? "Should really have won" : "Should have won";
}

/** The fill of an Upset: rave for one in our favour, loss for one against us. */
export const UPSET_FILL: Record<Expectation["kind"], string> = {
  "upset-win": "bg-win text-shale-950",
  "should-have-won": "bg-loss text-shale-950",
};

/** A slanted badge naming an Upset, for the hero ScoreBar's tab cluster. */
export function UpsetBadge({ upset }: { upset: Expectation }) {
  return (
    <span
      className={`clip-slant inline-flex h-6 items-center whitespace-nowrap px-2.5 font-display font-extrabold text-base uppercase leading-none [--slant:0.3rem] ${UPSET_FILL[upset.kind]}`}
    >
      {upsetLabel(upset)}
    </span>
  );
}
