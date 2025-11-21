/**
 * Event Bus Data Source API Routes
 *
 * Provides REST API endpoints for querying events from the event bus data source
 */

import { Router } from 'express';
import { eventBusDataSource, type EventQueryOptions } from './event-bus-data-source';

const router = Router();

/**
 * GET /api/event-bus/events
 * Query events with filters
 */
// Helper to safely parse dates
const parseDate = (dateStr: string | undefined): Date | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
};

// Helper to safely parse integers with validation
const parseIntSafe = (value: string | undefined, defaultValue: number, max?: number): number => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) return defaultValue;
  return max ? Math.min(parsed, max) : parsed;
};

router.get('/events', async (req, res) => {
  try {
    // Parse and validate event_types array (limit to 100 to prevent DoS)
    let eventTypes: string[] | undefined;
    if (req.query.event_types) {
      eventTypes = (req.query.event_types as string).split(',').slice(0, 100); // Max 100 event types
      if (eventTypes.length === 0) {
        eventTypes = undefined;
      }
    }

    const options: EventQueryOptions = {
      event_types: eventTypes,
      tenant_id: req.query.tenant_id as string | undefined,
      namespace: req.query.namespace as string | undefined,
      correlation_id: req.query.correlation_id as string | undefined,
      source: req.query.source as string | undefined,
      start_time: parseDate(req.query.start_time as string | undefined),
      end_time: parseDate(req.query.end_time as string | undefined),
      limit: parseIntSafe(req.query.limit as string | undefined, 100, 1000), // Max 1000
      offset: parseIntSafe(req.query.offset as string | undefined, 0),
      order_by: (req.query.order_by as 'timestamp' | 'processed_at') || 'timestamp',
      order_direction: (req.query.order_direction as 'asc' | 'desc') || 'desc',
    };

    const events = await eventBusDataSource.queryEvents(options);

    res.json({
      events,
      count: events.length,
      options,
    });
  } catch (error) {
    console.error('Error querying events:', error);
    res.status(500).json({
      error: 'Failed to query events',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/event-bus/statistics
 * Get event statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const timeRange =
      req.query.start && req.query.end
        ? {
            start:
              parseDate(req.query.start as string) || new Date(Date.now() - 24 * 60 * 60 * 1000), // Default to last 24h
            end: parseDate(req.query.end as string) || new Date(),
          }
        : {
            // Default to last 24 hours if no range provided
            start: new Date(Date.now() - 24 * 60 * 60 * 1000),
            end: new Date(),
          };

    const statistics = await eventBusDataSource.getStatistics(timeRange);

    res.json(statistics);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/event-bus/status
 * Get data source status
 */
router.get('/status', async (req, res) => {
  try {
    const isActive = eventBusDataSource.isActive();
    const isValid = await eventBusDataSource.validateConnection();

    res.json({
      active: isActive,
      connected: isValid,
      status: isActive ? 'running' : 'stopped',
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
