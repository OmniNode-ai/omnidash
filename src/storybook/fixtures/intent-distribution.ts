/** Fixture factory for IntentDistributionWidget stories. */

// Raw projection rows (OMN-14751): the widget groups client-side.
interface IntentEventRow {
  intent_id: string;
  session_ref: string;
  intent_category: string;
  confidence: number;
  agent_source: 'claude' | 'cursor' | null;
  created_at: string;
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

const SOURCES: Array<'claude' | 'cursor' | null> = ['claude', 'cursor', null];

/**
 * Build N raw intent event rows with a plausible category skew.
 * The widget computes counts/percentages itself.
 */
export function buildIntentDistribution(n = 120): IntentEventRow[] {
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => ({
    // Quadratic skew: earlier categories appear more often.
    intent_category:
      CATEGORIES[Math.floor(((i * i) % (CATEGORIES.length * 7)) / 7) % CATEGORIES.length],
    intent_id: `intent-${String(i).padStart(4, '0')}`,
    session_ref: `session-${String(Math.floor(i / 6)).padStart(3, '0')}`,
    confidence: 0.4 + (((i * 13) % 60) / 100),
    agent_source: SOURCES[i % SOURCES.length],
    created_at: new Date(now - i * 60_000).toISOString(),
  }));
}
