/**
 * Pattern Learning Data Source
 *
 * Fetches PATLEARN artifacts from API endpoints.
 * Part of OMN-1699: Pattern Dashboard with Evidence-Based Score Debugging
 */

import {
  patlearnArtifactSchema,
  patlearnSummarySchema,
  type PatlearnArtifact,
  type PatlearnSummary,
  type LifecycleState,
  type SimilarityEvidence,
} from '../schemas/api-response-schemas';

// ===========================
// Types
// ===========================

export interface PatlearnListParams {
  state?: LifecycleState | LifecycleState[];
  limit?: number;
  offset?: number;
  sort?: 'score' | 'created' | 'updated';
  order?: 'asc' | 'desc';
}

export interface PatlearnDetailResponse {
  artifact: PatlearnArtifact;
  similarPatterns: Array<{ patternId: string; evidence: SimilarityEvidence }>;
}

// ===========================
// Helper Functions
// ===========================

function safeParseArray<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T } },
  data: unknown,
  context: string
): T[] {
  if (!Array.isArray(data)) {
    console.warn(`[${context}] Expected array, got ${typeof data}`);
    return [];
  }

  return data
    .map((item, index) => {
      const result = schema.safeParse(item);
      if (!result.success) {
        console.warn(`[${context}] Item ${index} failed validation`);
        return null;
      }
      return result.data;
    })
    .filter((item): item is T => item !== null);
}

function safeParseOne<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T } },
  data: unknown,
  context: string
): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[${context}] Validation failed`);
    return null;
  }
  return result.data ?? null;
}

// ===========================
// Data Source Class
// ===========================

class PatternLearningSource {
  private baseUrl = '/api/intelligence/patterns/patlearn';

  /**
   * List patterns with filtering
   */
  async list(params: PatlearnListParams = {}): Promise<PatlearnArtifact[]> {
    try {
      const query = new URLSearchParams();

      if (params.state) {
        const states = Array.isArray(params.state) ? params.state.join(',') : params.state;
        query.set('state', states);
      }
      if (params.limit !== undefined) query.set('limit', String(params.limit));
      if (params.offset !== undefined) query.set('offset', String(params.offset));
      if (params.sort) query.set('sort', params.sort);
      if (params.order) query.set('order', params.order);

      const url = query.toString() ? `${this.baseUrl}?${query}` : this.baseUrl;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[patlearn-list] HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();
      return safeParseArray(patlearnArtifactSchema, data, 'patlearn-list');
    } catch (error) {
      console.error('[patlearn-list] Fetch error:', error);
      return [];
    }
  }

  /**
   * Get summary metrics
   */
  async summary(window: '24h' | '7d' | '30d' = '24h'): Promise<PatlearnSummary | null> {
    try {
      const response = await fetch(`${this.baseUrl}/summary?window=${window}`);

      if (!response.ok) {
        console.error(`[patlearn-summary] HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      return safeParseOne(patlearnSummarySchema, data, 'patlearn-summary');
    } catch (error) {
      console.error('[patlearn-summary] Fetch error:', error);
      return null;
    }
  }

  /**
   * Get full detail for a pattern (for ScoreDebugger)
   */
  async detail(id: string): Promise<PatlearnDetailResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${id}`);

      if (!response.ok) {
        console.error(`[patlearn-detail] HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();

      // Validate the artifact part
      const artifact = safeParseOne(patlearnArtifactSchema, data.artifact, 'patlearn-detail');
      if (!artifact) return null;

      return {
        artifact,
        similarPatterns: data.similarPatterns || [],
      };
    } catch (error) {
      console.error('[patlearn-detail] Fetch error:', error);
      return null;
    }
  }

  // ===========================
  // Derived Views (Convenience Methods)
  // ===========================

  /**
   * Get candidates (candidate + provisional states)
   */
  async candidates(limit = 50): Promise<PatlearnArtifact[]> {
    return this.list({
      state: ['candidate', 'provisional'],
      limit,
      sort: 'score',
      order: 'desc',
    });
  }

  /**
   * Get validated patterns (learned)
   */
  async validated(limit = 50): Promise<PatlearnArtifact[]> {
    return this.list({
      state: 'validated',
      limit,
      sort: 'score',
      order: 'desc',
    });
  }

  /**
   * Get deprecated patterns
   */
  async deprecated(limit = 50): Promise<PatlearnArtifact[]> {
    return this.list({
      state: 'deprecated',
      limit,
      sort: 'updated',
      order: 'desc',
    });
  }

  /**
   * Get all patterns sorted by score
   */
  async topPatterns(limit = 20): Promise<PatlearnArtifact[]> {
    return this.list({
      limit,
      sort: 'score',
      order: 'desc',
    });
  }
}

// ===========================
// Export Singleton
// ===========================

// Note: Named 'patlearnSource' to avoid collision with legacy patternLearningSource in archive
export const patlearnSource = new PatternLearningSource();

// Re-export types for convenience
export type {
  PatlearnArtifact,
  PatlearnSummary,
  LifecycleState,
  SimilarityEvidence,
} from '../schemas/api-response-schemas';
