/**
 * Lakshman 2026-11-05 ("define 5 colors 0 to 20% then 21 to 40 and so on, unique, logical and different colors"): a
 * pass rate falls in one of five bands of the whole percent, each with its own colour token (--ds-pass-band-1..5, red
 * through orange, amber and lime to green, in light and dark). The band only colours the served rate; the figure and
 * its runs are always written beside it, so the colour is never the only signal.
 */
export type PassBand = 1 | 2 | 3 | 4 | 5;

/** The bands, lowest first: the whole-percent ceiling of each and the words its key shows. */
export const PASS_BANDS: ReadonlyArray<{ band: PassBand; upTo: number; label: string }> = [
  { band: 1, upTo: 20, label: '0–20%' },
  { band: 2, upTo: 40, label: '21–40%' },
  { band: 3, upTo: 60, label: '41–60%' },
  { band: 4, upTo: 80, label: '61–80%' },
  { band: 5, upTo: 100, label: '81–100%' },
];

/** The band of passed out of judged runs, by the rounded whole percent; none when no run has a verdict. */
export function passBand(passed: number, judged: number): PassBand | undefined {
  if (!(judged > 0) || !Number.isFinite(passed)) return undefined;
  const percent = Math.round((passed / judged) * 100);
  return PASS_BANDS.find(entry => percent <= entry.upTo)?.band ?? PASS_BANDS[PASS_BANDS.length - 1]!.band;
}
