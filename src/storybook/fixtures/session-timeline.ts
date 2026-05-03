/** Fixture factory for SessionTimelineWidget stories. */

interface TimelineEvent {
  intent_id: string;
  session_ref: string;
  intent_category: string;
  confidence: number;
  keywords: string[];
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
];

const KEYWORD_POOL = [
  'kafka', 'react', 'typescript', 'postgres', 'docker',
  'migration', 'ci', 'deploy', 'lint', 'test', 'fix',
  'refactor', 'api', 'schema', 'contract', 'node',
];

/**
 * Build N timeline events spread across the last 4 hours.
 */
export function buildSessionTimeline(n = 30): TimelineEvent[] {
  const now = Date.now();
  const span = 4 * 60 * 60 * 1000; // 4h
  return Array.from({ length: n }, (_, i) => {
    const catIdx = i % CATEGORIES.length;
    const kwCount = 1 + (i % 4);
    const kwStart = i % KEYWORD_POOL.length;
    const keywords: string[] = [];
    for (let k = 0; k < kwCount; k++) {
      keywords.push(KEYWORD_POOL[(kwStart + k) % KEYWORD_POOL.length]);
    }
    return {
      intent_id: `intent-${String(i).padStart(4, '0')}`,
      session_ref: `session-${String(Math.floor(i / 5)).padStart(3, '0')}`,
      intent_category: CATEGORIES[catIdx],
      confidence: 0.4 + (((i * 17) % 60) / 100), // 0.40..0.99
      keywords,
      created_at: new Date(now - span + (i / n) * span).toISOString(),
    };
  });
}
