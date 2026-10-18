type MatchHeadlineProps = {
  /** At most 80 characters (CLUBS-43). */
  text: string;
  /**
   * `hero` under a hero ScoreBar wraps to show it whole; `compact` under a
   * list row stays on one line, cut with an ellipsis, with the full text in
   * its tooltip.
   */
  size?: "hero" | "compact";
};

/**
 * A Match's tabloid headline, set like a back-page strapline under its
 * ScoreBar. Ordinary site copy: no label says who wrote it. Without one,
 * render nothing and the ScoreBar's score line stands alone.
 */
export function MatchHeadline({ text, size = "compact" }: MatchHeadlineProps) {
  if (size === "hero") {
    return (
      <p className="mt-3 font-display font-extrabold text-2xl text-ink uppercase italic leading-tight tracking-wide sm:text-3xl">
        {text}
      </p>
    );
  }
  return (
    <p
      title={text}
      className="mt-1.5 truncate font-display font-bold text-ink-soft text-lg uppercase italic leading-tight tracking-wide"
    >
      {text}
    </p>
  );
}
