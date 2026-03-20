/**
 * Consumer Health API Routes (OMN-5527)
 *
 * Serves consumer health summaries and recent events,
 * powered by ConsumerHealthProjection.
 * Used by the ConsumerHealthDashboard page.
 */

import { Router } from 'express';
import {
  ConsumerHealthProjection,
  type ConsumerHealthWindow,
} from './projections/consumer-health-projection';

export const consumerHealthRoutes = Router();

const projection = new ConsumerHealthProjection();

const VALID_WINDOWS: ConsumerHealthWindow[] = ['1h', '24h', '7d'];

function parseWindow(raw: unknown): ConsumerHealthWindow {
  const s = String(raw ?? '24h');
  return VALID_WINDOWS.includes(s as ConsumerHealthWindow) ? (s as ConsumerHealthWindow) : '24h';
}

// GET /api/consumer-health/summary?window=24h
consumerHealthRoutes.get('/summary', async (req, res) => {
  try {
    const window = parseWindow(req.query.window);
    const data = await projection.ensureFreshForWindow(window);
    res.json({
      consumers: data.consumers,
      severityCounts: data.severityCounts,
      totalEvents: data.totalEvents,
      window: data.window,
    });
  } catch (error) {
    console.error('Error fetching consumer health summary:', error);
    res.status(500).json({
      error: 'Failed to fetch consumer health summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/consumer-health/events?window=24h
consumerHealthRoutes.get('/events', async (req, res) => {
  try {
    const window = parseWindow(req.query.window);
    const data = await projection.ensureFreshForWindow(window);
    res.json({ events: data.recentEvents, window: data.window });
  } catch (error) {
    console.error('Error fetching consumer health events:', error);
    res.status(500).json({
      error: 'Failed to fetch consumer health events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
