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
 * `count` of them, always including zero when the data does.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    if (min === 0) return [0, 1];
    [min, max] = min > 0 ? [0, min] : [min, 0];
  }
  const step = niceStep((max - min) / count);
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
  const nice =
    residual <= 1
      ? 1
      : residual <= 2
        ? 2
        : residual <= 2.5
          ? 2.5
          : residual <= 5
            ? 5
            : 10;
  return nice * magnitude;
}

/** Compact tick label: 950, 1.2K, 12K, 3.4M. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const [divisor, suffix] =
    abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "K"] : [1, ""];
  const scaled = Number.parseFloat((value / divisor).toFixed(1));
  return `${scaled}${suffix}`;
}
