import type { ComponentProps, ReactNode } from "react";

/** The slanted chip look, shared by toggles and the buttons beside them. */
export function chipClassName(pressed: boolean): string {
  return [
    "clip-slant min-h-9 shrink-0 whitespace-nowrap px-3.5 font-display font-bold text-base uppercase tracking-wide transition-colors [--slant:0.35rem]",
    // clip-slant would cut off an outer focus ring, so draw it inside, in ink to show on rave too.
    "focus-visible:-outline-offset-4 focus-visible:outline-ink",
    "disabled:cursor-not-allowed",
    pressed
      ? "bg-rave text-shale-950"
      : "bg-shale-800 text-ink-soft hover:bg-shale-700 hover:text-ink disabled:text-ink-muted disabled:hover:bg-shale-800",
  ].join(" ");
}

type ChipProps = Pick<
  ComponentProps<"button">,
  "disabled" | "title" | "aria-expanded" | "aria-controls"
> & {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** A slanted filter toggle button. */
export function Chip({ pressed, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={chipClassName(pressed)}
      {...props}
    />
  );
}
