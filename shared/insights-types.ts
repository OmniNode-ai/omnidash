/**
 * Learned Insights Types
 *
 * Shared types for the Learned Insights dashboard API and client.
 * Displays insights from OmniClaude sessions — patterns, conventions,
 * architecture decisions, error resolutions, and tool usage.
 *
 * @see OMN-1407 - Learned Insights Panel (OmniClaude Integration)
 */

// ============================================================================
// Core Types
// ============================================================================

export type InsightType = 'pattern' | 'convention' | 'architecture' | 'error' | 'tool';

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number;
  evidence_count: number;
  learned_at: string;
  updated_at: string;
  trending: boolean;
  approved: boolean | null;
  details?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/** Summary response for the insights dashboard */
export interface InsightsSummary {
  insights: Insight[];
  total: number;
  new_this_week: number;
  avg_confidence: number;
  total_sessions_analyzed: number;
  by_type: Record<InsightType, number>;
}

/** Trend data point for the insights trend chart */
export interface InsightsTrendPoint {
  date: string;
  new_insights: number;
  cumulative_insights: number;
  avg_confidence: number;
  sessions_analyzed: number;
}
