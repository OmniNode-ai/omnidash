/**
 * Runtime Errors API Routes (OMN-5528, OMN-5654)
 *
 * Serves runtime error summaries, recent events, and triage state,
 * powered by RuntimeErrorsProjection.
 * Used by the RuntimeErrorsDashboard page.
 */

import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { runtimeErrorTriageState } from '@shared/intelligence-schema';
import {
  RuntimeErrorsProjection,
  type RuntimeErrorWindow,
} from './projections/runtime-errors-projection';
import { tryGetIntelligenceDb } from './storage';

export const runtimeErrorsRoutes = Router();

const projection = new RuntimeErrorsProjection();

const VALID_WINDOWS: RuntimeErrorWindow[] = ['1h', '24h', '7d'];

function parseWindow(raw: unknown): RuntimeErrorWindow {
  const s = String(raw ?? '24h');
  return VALID_WINDOWS.includes(s as RuntimeErrorWindow) ? (s as RuntimeErrorWindow) : '24h';
}

// GET /api/runtime-errors/summary?window=24h
runtimeErrorsRoutes.get('/summary', async (req, res) => {
  try {
    const window = parseWindow(req.query.window);
    const data = await projection.ensureFreshForWindow(window);
    res.json({
      categoryCounts: data.categoryCounts,
      topFingerprints: data.topFingerprints,
      totalEvents: data.totalEvents,
      window: data.window,
    });
  } catch (error) {
    console.error('Error fetching runtime errors summary:', error);
    res.status(500).json({
      error: 'Failed to fetch runtime errors summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/runtime-errors/events?window=24h
runtimeErrorsRoutes.get('/events', async (req, res) => {
  try {
    const window = parseWindow(req.query.window);
    const data = await projection.ensureFreshForWindow(window);
    res.json({ events: data.recentEvents, window: data.window });
  } catch (error) {
    console.error('Error fetching runtime error events:', error);
    res.status(500).json({
      error: 'Failed to fetch runtime error events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/runtime-errors/triage — latest triage state per fingerprint (OMN-5654)
runtimeErrorsRoutes.get('/triage', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.json({ triageEntries: [] });
    }

    const rows = await db
      .select()
      .from(runtimeErrorTriageState)
      .orderBy(desc(runtimeErrorTriageState.lastTriagedAt))
      .limit(100);

    const triageEntries = rows.map((r) => ({
      fingerprint: r.fingerprint,
      action: r.action,
      actionStatus: r.actionStatus,
      ticketId: r.ticketId,
      ticketUrl: r.ticketUrl,
      autoFixType: r.autoFixType,
      autoFixVerified: r.autoFixVerified,
      severity: r.severity,
      errorCategory: r.errorCategory,
      container: r.container,
      operatorAttentionRequired: r.operatorAttentionRequired,
      recurrenceCount: r.recurrenceCount,
      firstSeenAt: r.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      lastTriagedAt: r.lastTriagedAt?.toISOString() ?? null,
    }));

    return res.json({ triageEntries });
  } catch (error) {
    console.error('Error fetching triage state:', error);
    return res.status(500).json({
      error: 'Failed to fetch triage state',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
