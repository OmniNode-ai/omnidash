/**
 * Hook health error events projection (OMN-7160).
 *
 * Provides time-windowed summary of hook error events for the
 * hook health dashboard card and API route.
 */

import { hookHealthEvents } from '@shared/intelligence-schema';
import { desc, gte, count } from 'drizzle-orm';
import { tryGetIntelligenceDb } from '../storage';

export interface HookHealthSummary {
  total_errors: number;
  tier_counts: Record<string, number>;
  category_counts: Record<string, number>;
  hook_counts: Record<string, number>;
  top_fingerprints: Array<{
    fingerprint: string;
    hook_name: string;
    error_category: string;
    error_message: string;
    occurrence_count: number;
    last_seen: string;
  }>;
}

const EMPTY_SUMMARY: HookHealthSummary = {
  total_errors: 0,
  tier_counts: {},
  category_counts: {},
  hook_counts: {},
  top_fingerprints: [],
};

export class HookHealthProjection {
  async summary(windowMinutes: number = 1440): Promise<HookHealthSummary> {
    const db = tryGetIntelligenceDb();
    if (!db) return EMPTY_SUMMARY;

    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    try {
      // Use SQL COUNT for accurate total (not rows.length which is capped)
      const totalResult = await db
        .select({ count: count() })
        .from(hookHealthEvents)
        .where(gte(hookHealthEvents.emittedAt, since));

      // Fetch recent rows for breakdown aggregation
      const rows = await db
        .select()
        .from(hookHealthEvents)
        .where(gte(hookHealthEvents.emittedAt, since))
        .orderBy(desc(hookHealthEvents.emittedAt))
        .limit(1000);

      const tierCounts: Record<string, number> = {};
      const categoryCounts: Record<string, number> = {};
      const hookCounts: Record<string, number> = {};
      const fingerprintMap = new Map<
        string,
        {
          hook_name: string;
          error_category: string;
          error_message: string;
          count: number;
          last_seen: string;
        }
      >();

      for (const row of rows) {
        tierCounts[row.errorTier] = (tierCounts[row.errorTier] || 0) + 1;
        categoryCounts[row.errorCategory] = (categoryCounts[row.errorCategory] || 0) + 1;
        hookCounts[row.hookName] = (hookCounts[row.hookName] || 0) + 1;

        const fingerprint = row.fingerprint?.trim();
        if (!fingerprint) continue;

        const existing = fingerprintMap.get(fingerprint);
        if (existing) {
          existing.count++;
          if (row.emittedAt.toISOString() > existing.last_seen) {
            existing.last_seen = row.emittedAt.toISOString();
          }
        } else {
          fingerprintMap.set(fingerprint, {
            hook_name: row.hookName,
            error_category: row.errorCategory,
            error_message: (row.errorMessage ?? '').slice(0, 200),
            count: 1,
            last_seen: row.emittedAt.toISOString(),
          });
        }
      }

      const topFingerprints = [...fingerprintMap.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([fp, data]) => ({
          fingerprint: fp,
          hook_name: data.hook_name,
          error_category: data.error_category,
          error_message: data.error_message,
          occurrence_count: data.count,
          last_seen: data.last_seen,
        }));

      return {
        total_errors: totalResult[0]?.count ?? 0,
        tier_counts: tierCounts,
        category_counts: categoryCounts,
        hook_counts: hookCounts,
        top_fingerprints: topFingerprints,
      };
    } catch {
      console.warn('[HookHealthProjection] query failed, returning empty summary');
      return EMPTY_SUMMARY;
    }
  }
}
