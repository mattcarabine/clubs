import type { ReactNode } from "react";
import { isRouteErrorResponse, Link } from "react-router";

import { EmptyState } from "./empty-state";

type BackLinkProps = {
  to: string;
  children: ReactNode;
};

/** "‹ All Matches": the way back to a detail page's list, above its header. */
export function BackLink({ to, children }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="mb-4 inline-block font-display font-bold text-ink-muted text-lg uppercase tracking-wide hover:text-ink"
    >
      <span aria-hidden>‹ </span>
      {children}
    </Link>
  );
}

/** Whether an ErrorBoundary's `error` is a 404 response. */
export function isNotFound(error: unknown): boolean {
  return isRouteErrorResponse(error) && error.status === 404;
}

type RouteErrorProps = {
  /** The route ErrorBoundary's `error`. */
  error: unknown;
  /** What the page shows, in CONTEXT.md terms: "Match", "Squad Member". */
  subject: string;
  /** Why an ID might not be found, e.g. "It may be older than the first Poll." */
  notFoundDescription: string;
  back: BackLinkProps;
};

/**
 * A detail page's error boundary: the back link, then an EmptyState saying
 * whether nothing has this ID (a 404) or the page failed to load.
 */
export function RouteError({
  error,
  subject,
  notFoundDescription,
  back,
}: RouteErrorProps) {
  const notFound = isNotFound(error);
  return (
    <>
      <BackLink {...back} />
      <EmptyState
        title={
          notFound ? `${subject} not found` : `This ${subject} could not load`
        }
        description={
          notFound
            ? notFoundDescription
            : `Something went wrong loading this ${subject}. Try again in a moment.`
        }
      />
    </>
  );
}
