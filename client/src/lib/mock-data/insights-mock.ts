/**
 * Mock Data for Learned Insights Dashboard
 *
 * Provides demo data when OmniMemory API is unavailable.
 * @see OMN-1407
 */

import type { InsightsSummary, InsightsTrendPoint, Insight } from '@shared/insights-types';

const MOCK_INSIGHTS: Insight[] = [
  {
    id: 'ins_001',
    type: 'pattern',
    title: 'Files Modified Together',
    description:
      'src/models/*.py and tests/unit/models/*.py are usually modified in the same session',
    confidence: 0.95,
    evidence_count: 47,
    learned_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    trending: true,
    approved: true,
    details:
      'Observed in 47 out of 50 sessions where model files were changed. The co-modification pattern has a Jaccard similarity of 0.94.',
  },
  {
    id: 'ins_002',
    type: 'convention',
    title: 'Poetry for Python Commands',
    description: 'Always use `poetry run` for Python commands instead of raw pip',
    confidence: 0.98,
    evidence_count: 124,
    learned_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    trending: false,
    approved: true,
    details:
      'Consistent across all Python repositories. Sessions that used pip directly had a 12% higher error rate.',
  },
  {
    id: 'ins_003',
    type: 'architecture',
    title: 'Four-Node Workflow Pattern',
    description: 'All workflows follow EFFECT → COMPUTE → REDUCER → ORCHESTRATOR',
    confidence: 0.92,
    evidence_count: 89,
    learned_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    trending: true,
    approved: true,
    details:
      'The four-node pattern is the canonical workflow structure. Deviations from this pattern correlate with 23% more revision cycles.',
  },
  {
    id: 'ins_004',
    type: 'error',
    title: 'Import Cycle Resolution',
    description: 'Circular imports between models/ and utils/ resolved by extracting shared types',
    confidence: 0.88,
    evidence_count: 15,
    learned_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    trending: false,
    approved: null,
    details:
      'Pattern detected in 15 sessions. Extracting shared type definitions into a types/ directory eliminated circular dependency errors in all cases.',
  },
  {
    id: 'ins_005',
    type: 'tool',
    title: 'Vitest over Jest for TypeScript',
    description:
      'Projects using Vite should always use Vitest for testing — faster and natively supports TS',
    confidence: 0.91,
    evidence_count: 34,
    learned_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    trending: true,
    approved: true,
    details:
      'Sessions using Vitest in Vite projects completed test-related tasks 40% faster than those using Jest with ts-jest.',
  },
  {
    id: 'ins_006',
    type: 'pattern',
    title: 'Schema-First API Design',
    description: 'Defining Zod schemas before implementing routes reduces type errors by 60%',
    confidence: 0.87,
    evidence_count: 28,
    learned_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    trending: false,
    approved: true,
  },
  {
    id: 'ins_007',
    type: 'convention',
    title: 'Drizzle ORM for New Tables',
    description: 'All new database tables should use Drizzle ORM with Zod validation schemas',
    confidence: 0.96,
    evidence_count: 56,
    learned_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    trending: false,
    approved: true,
  },
  {
    id: 'ins_008',
    type: 'architecture',
    title: 'Event-Driven State Updates',
    description:
      'WebSocket + TanStack Query invalidation is preferred over polling for real-time dashboards',
    confidence: 0.9,
    evidence_count: 22,
    learned_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    trending: false,
    approved: true,
  },
  {
    id: 'ins_009',
    type: 'error',
    title: 'Docker Network DNS',
    description: 'Container-to-container calls must use Docker service names, not localhost',
    confidence: 0.99,
    evidence_count: 67,
    learned_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    trending: false,
    approved: true,
  },
  {
    id: 'ins_010',
    type: 'tool',
    title: 'kcat for Kafka Debugging',
    description:
      'Use kcat (kafkacat) for quick topic inspection instead of custom consumer scripts',
    confidence: 0.85,
    evidence_count: 19,
    learned_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
    trending: true,
    approved: null,
  },
  {
    id: 'ins_011',
    type: 'pattern',
    title: 'Mock-First Data Sources',
    description:
      'Dashboard data sources should try API first, then gracefully fall back to mock data',
    confidence: 0.93,
    evidence_count: 31,
    learned_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    trending: false,
    approved: true,
  },
  {
    id: 'ins_012',
    type: 'convention',
    title: 'Carbon Design for Dashboards',
    description:
      'Dashboard UIs follow IBM Carbon Design System with information density over whitespace',
    confidence: 0.94,
    evidence_count: 42,
    learned_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 86400000).toISOString(),
    trending: false,
    approved: true,
  },
];

export function getMockInsightsSummary(): InsightsSummary {
  const byType = { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 };
  for (const ins of MOCK_INSIGHTS) {
    byType[ins.type]++;
  }

  const total = MOCK_INSIGHTS.length;
  const avgConf = MOCK_INSIGHTS.reduce((s, i) => s + i.confidence, 0) / total;
  const oneWeekAgo = Date.now() - 7 * 86400000;
  const newThisWeek = MOCK_INSIGHTS.filter(
    (i) => new Date(i.learned_at).getTime() > oneWeekAgo
  ).length;

  return {
    insights: MOCK_INSIGHTS,
    total,
    new_this_week: newThisWeek,
    avg_confidence: avgConf,
    total_sessions_analyzed: 312,
    by_type: byType,
  };
}

export function getMockInsightsTrend(): InsightsTrendPoint[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const base = 6 + i * 0.5;
    return {
      date: d.toISOString().slice(0, 10),
      new_insights: Math.max(0, Math.round(1 + Math.random() * 3)),
      cumulative_insights: Math.round(base + Math.random() * 2),
      avg_confidence: 0.85 + Math.random() * 0.1,
      sessions_analyzed: Math.round(18 + Math.random() * 12),
    };
  });
}
