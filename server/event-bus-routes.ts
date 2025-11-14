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
router.get('/events', async (req, res) => {
  try {
    const options: EventQueryOptions = {
      event_types: req.query.event_types ? (req.query.event_types as string).split(',') : undefined,
      tenant_id: req.query.tenant_id as string | undefined,
      namespace: req.query.namespace as string | undefined,
      correlation_id: req.query.correlation_id as string | undefined,
      start_time: req.query.start_time ? new Date(req.query.start_time as string) : undefined,
      end_time: req.query.end_time ? new Date(req.query.end_time as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
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
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/event-bus/statistics
 * Get event statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const timeRange = req.query.start && req.query.end ? {
      start: new Date(req.query.start as string),
      end: new Date(req.query.end as string),
    } : undefined;

    const statistics = await eventBusDataSource.getStatistics(timeRange);
    
    res.json(statistics);
  } catch (error) {
    console.error('Error getting statistics:', error);
    res.status(500).json({ 
      error: 'Failed to get statistics',
      message: error instanceof Error ? error.message : String(error)
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
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

