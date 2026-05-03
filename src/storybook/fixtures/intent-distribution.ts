/** Fixture factory for IntentDistributionWidget stories. */

interface IntentRow {
  intent_category: string;
  count: number;
  percentage: number;
}

const CATEGORIES = [
  'debugging',
  'code_generation',
  'refactoring',
  'testing',
  'documentation',
  'analysis',
  'code_review',
  'deployment',
  'unknown',
];

/**
 * Build N intent distribution rows with plausible counts.
 * Percentages are computed from counts so they always sum to ~100%.
 */
export function buildIntentDistribution(n = CATEGORIES.length): IntentRow[] {
  const cats = CATEGORIES.slice(0, Math.min(n, CATEGORIES.length));
  // Descending counts: first category gets the most
  const counts = cats.map((_, i) => Math.max(1, 50 - i * 5 + Math.round(Math.sin(i) * 8)));
  const total = counts.reduce((a, b) => a + b, 0);
  return cats.map((cat, i) => ({
    intent_category: cat,
    count: counts[i],
    percentage: Number(((counts[i] / total) * 100).toFixed(1)),
  }));
}
