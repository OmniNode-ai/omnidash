/**
 * Runtime Errors API Routes (OMN-5528, OMN-5654)
 *
 * Serves runtime error summaries, recent events, and triage state,
 * powered by RuntimeErrorsProjection.
 * Used by the RuntimeErrorsDashboard page.
 */

import { Router } from 'express';
import {
  RuntimeErrorsProjection,
  type RuntimeErrorWindow,
} from './projections/runtime-errors-projection';

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
// Data access goes through RuntimeErrorsProjection per OMN-2325 (no direct DB in routes).
runtimeErrorsRoutes.get('/triage', async (_req, res) => {
  try {
    const triageEntries = await projection.getTriageEntries();
    return res.json({ triageEntries });
  } catch (error) {
    console.error('Error fetching triage state:', error);
    return res.status(500).json({
      error: 'Failed to fetch triage state',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
