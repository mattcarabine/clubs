/** Maps a domain [d0, d1] linearly onto a range [r0, r1]. */
export function linearScale(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (value: number) => number {
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
}

/**
 * Round axis ticks covering [min, max]: steps of 1, 2, 2.5 or 5 x 10^n, about
 * `count` of them, always including zero when the data does. With `integer`,
 * steps are whole numbers, for counts and ratings that are never fractional.
 */
export function niceTicks(
  min: number,
  max: number,
  count = 4,
  { integer = false }: { integer?: boolean } = {},
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    if (min === 0) return [0, 1];
    [min, max] = min > 0 ? [0, min] : [min, 0];
  }
  const rough = niceStep((max - min) / count);
  // Below 1, or 2.5, round down to the nearest whole step instead.
  const step =
    integer && !Number.isInteger(rough)
      ? Math.max(1, Math.floor(rough))
      : rough;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= end + step / 2; t += step) {
    // Trim floating-point noise such as 0.30000000000000004.
    ticks.push(Number.parseFloat(t.toPrecision(12)));
  }
  return ticks;
}

function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const nice = NICE_STEPS.find((step) => residual <= step) ?? 10;
  return nice * magnitude;
}

const NICE_STEPS = [1, 2, 2.5, 5, 10] as const;

/**
 * Which x-axis category labels to draw so none repeat or collide. A run of
 * equal labels (several Matches on one date) is labelled once, where it
 * starts; labels closer than `minGap` px to the previous one are skipped; and
 * the final run is always labelled, dropping any neighbour that crowds it.
 * `spacing` is the distance in px between consecutive categories.
 */
export function axisLabelIndices(
  labels: readonly string[],
  spacing: number,
  minGap = 64,
): number[] {
  const fits = (from: number, to: number) => (to - from) * spacing >= minGap;
  const runStarts = labels.flatMap((label, i) =>
    i === 0 || label !== labels[i - 1] ? [i] : [],
  );
  const picked: number[] = [];
  for (const i of runStarts) {
    const previous = picked.at(-1);
    if (previous === undefined || fits(previous, i)) picked.push(i);
  }
  const finalRun = runStarts.at(-1);
  if (finalRun === undefined || picked.at(-1) === finalRun) return picked;
  while (picked.length > 1 && !fits(picked[picked.length - 1], finalRun)) {
    picked.pop();
  }
  if (fits(picked[0], finalRun)) picked.push(finalRun);
  return picked;
}

/** Pins the first and last x labels inside the plot; centres the rest. */
export function tickAnchor(
  index: number,
  last: number,
): "start" | "middle" | "end" {
  if (index === 0) return "start";
  if (index === last) return "end";
  return "middle";
}

/** Compact tick label: 950, 1.2K, 12K, 3.4M. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${trimToOneDecimal(value / 1e6)}M`;
  if (abs >= 1e3) return `${trimToOneDecimal(value / 1e3)}K`;
  return `${trimToOneDecimal(value)}`;
}

function trimToOneDecimal(value: number): number {
  return Number.parseFloat(value.toFixed(1));
}
