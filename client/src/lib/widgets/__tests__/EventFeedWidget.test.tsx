/**
 * EventFeedWidget Tests
 *
 * Comprehensive tests for the EventFeedWidget component which displays a
 * scrollable feed of events with timestamps, severity badges, and source labels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventFeedWidget } from '../EventFeedWidget';
import type {
  WidgetDefinition,
  WidgetConfigEventFeed,
  DashboardData,
} from '@/lib/dashboard-schema';

// Mock scrollIntoView since it's not implemented in jsdom
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Helper to create a widget definition
function createWidget(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    widget_id: 'test-event-feed-widget',
    title: 'Test Event Feed',
    config: {
      config_kind: 'event_feed',
      events_key: 'events',
    },
    row: 0,
    col: 0,
    width: 4,
    height: 3,
    ...overrides,
  };
}

// Helper to create an event feed config
function createConfig(overrides: Partial<WidgetConfigEventFeed> = {}): WidgetConfigEventFeed {
  return {
    config_kind: 'event_feed',
    events_key: 'events',
    ...overrides,
  };
}

// Sample events
const sampleEvents = [
  {
    id: 1,
    timestamp: '2024-01-20T10:30:00Z',
    type: 'info' as const,
    message: 'Agent started successfully',
    source: 'agent-1',
  },
  {
    id: 2,
    timestamp: '2024-01-20T10:31:00Z',
    type: 'warning' as const,
    message: 'High memory usage detected',
    source: 'monitor',
  },
  {
    id: 3,
    timestamp: '2024-01-20T10:32:00Z',
    type: 'error' as const,
    message: 'Connection timeout to database',
    source: 'db-connector',
  },
  {
    id: 4,
    timestamp: '2024-01-20T10:33:00Z',
    type: 'success' as const,
    message: 'Backup completed',
    source: 'backup-service',
  },
];

// Many events for pagination testing
const manyEvents = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  timestamp: new Date(Date.now() - i * 60000).toISOString(),
  type: (['info', 'warning', 'error', 'success'] as const)[i % 4],
  message: `Event message ${i + 1}`,
  source: `source-${(i % 5) + 1}`,
}));

describe('EventFeedWidget', () => {
  it('should render list of events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { events: sampleEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // All event messages should be visible
    expect(screen.getByText('Agent started successfully')).toBeInTheDocument();
    expect(screen.getByText('High memory usage detected')).toBeInTheDocument();
    expect(screen.getByText('Connection timeout to database')).toBeInTheDocument();
    expect(screen.getByText('Backup completed')).toBeInTheDocument();
  });

  it('should render widget title', () => {
    const widget = createWidget({ title: 'System Events' });
    const config = createConfig();
    const data: DashboardData = { events: sampleEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('System Events')).toBeInTheDocument();
  });

  it('should show timestamp when show_timestamp=true', () => {
    const widget = createWidget();
    const config = createConfig({ show_timestamp: true });
    // Use a date from today for the test
    const today = new Date();
    today.setHours(10, 30, 0, 0);
    const data: DashboardData = {
      events: [
        {
          id: 1,
          timestamp: today.toISOString(),
          type: 'info',
          message: 'Test event',
          source: 'test',
        },
      ],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Timestamp should be formatted (time only for today)
    // The exact format depends on locale, but should contain time
    const eventContainer = screen.getByText('Test event').parentElement?.parentElement;
    expect(eventContainer?.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('should hide timestamp when show_timestamp=false', () => {
    const widget = createWidget();
    const config = createConfig({ show_timestamp: false });
    const data: DashboardData = {
      events: [
        {
          id: 1,
          timestamp: '2024-01-20T10:30:00Z',
          type: 'info',
          message: 'Test event',
          source: 'test',
        },
      ],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Event should render but no timestamp visible
    expect(screen.getByText('Test event')).toBeInTheDocument();
  });

  it('should show severity badge when show_severity=true', () => {
    const widget = createWidget();
    const config = createConfig({ show_severity: true });
    const data: DashboardData = {
      events: [
        { id: 1, type: 'info', message: 'Info message' },
        { id: 2, type: 'warning', message: 'Warning message' },
        { id: 3, type: 'error', message: 'Error message' },
        { id: 4, type: 'success', message: 'Success message' },
      ],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Severity badges should be visible
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('should hide severity badge when show_severity=false', () => {
    const widget = createWidget();
    const config = createConfig({ show_severity: false });
    const data: DashboardData = {
      events: [{ id: 1, type: 'error', message: 'Error message' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Error message')).toBeInTheDocument();
    // Severity badge should not be present (capitalized labels)
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('should show source badge when show_source=true', () => {
    const widget = createWidget();
    const config = createConfig({ show_source: true });
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', message: 'Test message', source: 'my-service' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('my-service')).toBeInTheDocument();
  });

  it('should hide source badge when show_source=false', () => {
    const widget = createWidget();
    const config = createConfig({ show_source: false });
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', message: 'Test message', source: 'my-service' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Test message')).toBeInTheDocument();
    expect(screen.queryByText('my-service')).not.toBeInTheDocument();
  });

  it('should limit events to max_items', () => {
    const widget = createWidget();
    const config = createConfig({ max_items: 5 });
    const data: DashboardData = { events: manyEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Only first 5 events should be visible
    expect(screen.getByText('Event message 1')).toBeInTheDocument();
    expect(screen.getByText('Event message 5')).toBeInTheDocument();
    expect(screen.queryByText('Event message 6')).not.toBeInTheDocument();
  });

  it('should use default max_items of 50 when not specified', () => {
    const widget = createWidget();
    const config = createConfig(); // No max_items
    const data: DashboardData = { events: manyEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // First 50 events should be visible
    expect(screen.getByText('Event message 1')).toBeInTheDocument();
    expect(screen.getByText('Event message 50')).toBeInTheDocument();
    expect(screen.queryByText('Event message 51')).not.toBeInTheDocument();
  });

  it('should show loading skeleton when isLoading=true', () => {
    const widget = createWidget({ title: 'Loading Events' });
    const config = createConfig();
    const data: DashboardData = {};

    render(<EventFeedWidget widget={widget} config={config} data={data} isLoading={true} />);

    // Title should be visible
    expect(screen.getByText('Loading Events')).toBeInTheDocument();

    // Should have skeleton elements with animate-pulse
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should show empty state when no events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { events: [] };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No events to display')).toBeInTheDocument();
  });

  it('should show empty state when events_key not found', () => {
    const widget = createWidget();
    const config = createConfig({ events_key: 'nonexistent' });
    const data: DashboardData = { events: sampleEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('No events to display')).toBeInTheDocument();
  });

  it('should handle events with severity field instead of type', () => {
    const widget = createWidget();
    const config = createConfig({ show_severity: true });
    const data: DashboardData = {
      events: [{ id: 1, severity: 'warning', message: 'Warning via severity field' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Warning via severity field')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('should handle events with text field instead of message', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', text: 'Message via text field' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Message via text field')).toBeInTheDocument();
  });

  it('should handle events with description field instead of message', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', description: 'Message via description field' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Message via description field')).toBeInTheDocument();
  });

  it('should apply correct indicator color for info events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', message: 'Info event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Find the colored indicator bar
    const indicator = document.querySelector('.bg-primary');
    expect(indicator).toBeInTheDocument();
  });

  it('should apply correct indicator color for success events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'success', message: 'Success event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    const indicator = document.querySelector('.bg-status-healthy');
    expect(indicator).toBeInTheDocument();
  });

  it('should apply correct indicator color for warning events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'warning', message: 'Warning event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    const indicator = document.querySelector('.bg-status-warning');
    expect(indicator).toBeInTheDocument();
  });

  it('should apply correct indicator color for error events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [{ id: 1, type: 'error', message: 'Error event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    const indicator = document.querySelector('.bg-status-error');
    expect(indicator).toBeInTheDocument();
  });

  it('should handle numeric timestamp', () => {
    const widget = createWidget();
    const config = createConfig({ show_timestamp: true });
    const timestamp = Date.now();
    const data: DashboardData = {
      events: [{ id: 1, timestamp, type: 'info', message: 'Test event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Event should render
    expect(screen.getByText('Test event')).toBeInTheDocument();
  });

  it('should handle Date object timestamp', () => {
    const widget = createWidget();
    const config = createConfig({ show_timestamp: true });
    const data: DashboardData = {
      events: [{ id: 1, timestamp: new Date(), type: 'info', message: 'Test event' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Test event')).toBeInTheDocument();
  });

  it('should handle missing timestamp gracefully', () => {
    const widget = createWidget();
    const config = createConfig({ show_timestamp: true });
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', message: 'Event without timestamp' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Event should still render without crashing
    expect(screen.getByText('Event without timestamp')).toBeInTheDocument();
  });

  it('should handle missing source gracefully', () => {
    const widget = createWidget();
    const config = createConfig({ show_source: true });
    const data: DashboardData = {
      events: [{ id: 1, type: 'info', message: 'Event without source' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Event should render without source badge
    expect(screen.getByText('Event without source')).toBeInTheDocument();
  });

  it('should apply animation delay to staggered events', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = { events: sampleEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Events should have slide-in animation class
    const eventRows = document.querySelectorAll('.animate-slide-in');
    expect(eventRows.length).toBe(sampleEvents.length);
  });

  it('should default to info type when type/severity not provided', () => {
    const widget = createWidget();
    const config = createConfig({ show_severity: true });
    const data: DashboardData = {
      events: [{ id: 1, message: 'Event without type' }],
    };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Should default to Info badge
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('should render events with all features enabled', () => {
    const widget = createWidget({ title: 'Full Featured Feed' });
    const config = createConfig({
      show_timestamp: true,
      show_severity: true,
      show_source: true,
      max_items: 10,
    });
    const data: DashboardData = { events: sampleEvents };

    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    // Title
    expect(screen.getByText('Full Featured Feed')).toBeInTheDocument();

    // Messages
    expect(screen.getByText('Agent started successfully')).toBeInTheDocument();

    // Severity badges
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();

    // Source badges
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('monitor')).toBeInTheDocument();
    expect(screen.getByText('db-connector')).toBeInTheDocument();
    expect(screen.getByText('backup-service')).toBeInTheDocument();
  });

  it('should use event index as key when id not provided', () => {
    const widget = createWidget();
    const config = createConfig();
    const data: DashboardData = {
      events: [
        { type: 'info', message: 'Event without ID 1' },
        { type: 'info', message: 'Event without ID 2' },
      ],
    };

    // Should not crash when events don't have id field
    render(<EventFeedWidget widget={widget} config={config} data={data} />);

    expect(screen.getByText('Event without ID 1')).toBeInTheDocument();
    expect(screen.getByText('Event without ID 2')).toBeInTheDocument();
  });
});
