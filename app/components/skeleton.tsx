type SkeletonProps = {
  /** Size it like the content it stands in for, e.g. "h-24 w-full". */
  className?: string;
};

/** A pulsing placeholder block. Hidden from screen readers; wrap groups in <LoadingState>. */
export function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`block animate-shimmer bg-shale-800 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Announces loading once and lays out skeletons for a typical panel: score bar, tiles, rows. */
export function LoadingState({
  label = "Loading",
  rows = 4,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-label={label} className="grid gap-3">
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-1">
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
    </div>
  );
}
