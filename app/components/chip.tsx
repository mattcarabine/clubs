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

type ChipGroupProps = {
  /** The group's visible legend, which also names it for screen readers. */
  label: string;
  /** Disables every control inside, e.g. a filter that does not apply. */
  disabled?: boolean;
  /** A tooltip for the whole group, e.g. why it is disabled. */
  title?: string;
  /** Extra description for screen readers, by element ID. */
  "aria-describedby"?: string;
  children: ReactNode;
};

/** A labelled row of chips: one filter in the FilterBar, or a control beside it. */
export function ChipGroup({ label, children, ...props }: ChipGroupProps) {
  return (
    <fieldset
      className={`shrink-0 sm:min-w-0 sm:shrink ${props.disabled ? "opacity-60" : ""}`}
      {...props}
    >
      <legend className="mb-1.5 whitespace-nowrap text-ink-muted text-sm">
        {label}
      </legend>
      {/* Relative, so sr-only text inside stays within the scrolling rail. */}
      <div className="relative flex gap-1 sm:flex-wrap">{children}</div>
    </fieldset>
  );
}
