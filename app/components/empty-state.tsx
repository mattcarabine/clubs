import type { ReactNode } from "react";

type EmptyStateProps = {
  /** What is missing, plainly: "No Matches yet". */
  title: string;
  /** What will fill it or what to do next. */
  description?: ReactNode;
  /** Optional next step, e.g. a link to another page. */
  action?: ReactNode;
};

/** Placeholder for a section with nothing to show, styled as an off-air card. */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-3 border border-shale-700 border-dashed bg-shale-900/60 p-6 sm:p-8">
      <span aria-hidden className="flex gap-1">
        <span className="h-6 w-2 -skew-x-12 bg-shale-700" />
        <span className="h-6 w-2 -skew-x-12 bg-shale-700" />
        <span className="h-6 w-2 -skew-x-12 bg-rave" />
      </span>
      <p className="font-display font-extrabold text-2xl text-ink uppercase tracking-wide">
        {title}
      </p>
      {description && (
        <p className="max-w-prose text-ink-soft text-sm">{description}</p>
      )}
      {action}
    </div>
  );
}
