import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import {
  EventFeedSidebar,
  getEventSeverity,
  formatEventType,
  formatTime,
} from '../EventFeedSidebar';
import type { RecentRegistryEvent } from '@/hooks/useRegistryWebSocket';

// Helper to create mock events
function createMockEvent(overrides: Partial<RecentRegistryEvent> = {}): RecentRegistryEvent {
  return {
    id: `event-${Math.random().toString(36).substring(7)}`,
    type: 'NODE_REGISTERED',
    timestamp: new Date('2024-01-15T14:30:45'),
    payload: {},
    correlationId: `corr-${Math.random().toString(36).substring(7)}`,
    ...overrides,
  };
}

describe('getEventSeverity', () => {
  describe('INSTANCE_HEALTH_CHANGED events', () => {
    it('returns "error" for critical health', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'critical' },
      });
      expect(getEventSeverity(event)).toBe('error');
    });

    it('returns "error" for unhealthy health', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'unhealthy' },
      });
      expect(getEventSeverity(event)).toBe('error');
    });

    it('returns "error" for dead health', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'dead' },
      });
      expect(getEventSeverity(event)).toBe('error');
    });

    it('returns "error" for CRITICAL (case-insensitive)', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'CRITICAL' },
      });
      expect(getEventSeverity(event)).toBe('error');
    });

    it('returns "warning" for degraded health', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'degraded' },
      });
      expect(getEventSeverity(event)).toBe('warning');
    });

    it('returns "warning" for warning health', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'warning' },
      });
      expect(getEventSeverity(event)).toBe('warning');
    });

    it('returns "info" for healthy status', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'healthy' },
      });
      expect(getEventSeverity(event)).toBe('info');
    });

    it('uses health_status as fallback when new_health is not present', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { health_status: 'critical' },
      });
      expect(getEventSeverity(event)).toBe('error');
    });

    it('prefers new_health over health_status', () => {
      const event = createMockEvent({
        type: 'INSTANCE_HEALTH_CHANGED',
        payload: { new_health: 'healthy', health_status: 'critical' },
      });
      expect(getEventSeverity(event)).toBe('info');
    });
  });

  describe('warning events', () => {
    it('returns "warning" for NODE_DEREGISTERED', () => {
      const event = createMockEvent({ type: 'NODE_DEREGISTERED' });
      expect(getEventSeverity(event)).toBe('warning');
    });

    it('returns "warning" for INSTANCE_REMOVED', () => {
      const event = createMockEvent({ type: 'INSTANCE_REMOVED' });
      expect(getEventSeverity(event)).toBe('warning');
    });
  });

  describe('info events', () => {
    it('returns "info" for NODE_REGISTERED', () => {
      const event = createMockEvent({ type: 'NODE_REGISTERED' });
      expect(getEventSeverity(event)).toBe('info');
    });

    it('returns "info" for NODE_STATE_CHANGED', () => {
      const event = createMockEvent({ type: 'NODE_STATE_CHANGED' });
      expect(getEventSeverity(event)).toBe('info');
    });

    it('returns "info" for NODE_HEARTBEAT', () => {
      const event = createMockEvent({ type: 'NODE_HEARTBEAT' });
      expect(getEventSeverity(event)).toBe('info');
    });

    it('returns "info" for INSTANCE_ADDED', () => {
      const event = createMockEvent({ type: 'INSTANCE_ADDED' });
      expect(getEventSeverity(event)).toBe('info');
    });
  });
});

describe('formatEventType', () => {
  it('converts NODE_REGISTERED to "Node Registered"', () => {
    expect(formatEventType('NODE_REGISTERED')).toBe('Node Registered');
  });

  it('converts NODE_DEREGISTERED to "Node Deregistered"', () => {
    expect(formatEventType('NODE_DEREGISTERED')).toBe('Node Deregistered');
  });

  it('converts NODE_STATE_CHANGED to "Node State Changed"', () => {
    expect(formatEventType('NODE_STATE_CHANGED')).toBe('Node State Changed');
  });

  it('converts NODE_HEARTBEAT to "Node Heartbeat"', () => {
    expect(formatEventType('NODE_HEARTBEAT')).toBe('Node Heartbeat');
  });

  it('converts INSTANCE_HEALTH_CHANGED to "Instance Health Changed"', () => {
    expect(formatEventType('INSTANCE_HEALTH_CHANGED')).toBe('Instance Health Changed');
  });

  it('converts INSTANCE_ADDED to "Instance Added"', () => {
    expect(formatEventType('INSTANCE_ADDED')).toBe('Instance Added');
  });

  it('converts INSTANCE_REMOVED to "Instance Removed"', () => {
    expect(formatEventType('INSTANCE_REMOVED')).toBe('Instance Removed');
  });

  it('handles single word', () => {
    expect(formatEventType('TEST')).toBe('Test');
  });

  it('handles empty string', () => {
    expect(formatEventType('')).toBe('');
  });
});

describe('formatTime', () => {
  it('returns time in HH:MM:SS format', () => {
    const date = new Date('2024-01-15T14:30:45');
    const result = formatTime(date);
    // The exact format depends on locale, but should contain hours, minutes, seconds
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });

  it('formats morning time correctly', () => {
    const date = new Date('2024-01-15T09:05:03');
    const result = formatTime(date);
    expect(result).toMatch(/9:05:03|09:05:03/);
  });

  it('formats afternoon time correctly', () => {
    const date = new Date('2024-01-15T15:30:45');
    const result = formatTime(date);
    // Could be 12-hour or 24-hour format depending on locale
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe('EventFeedSidebar Component', () => {
  const mockOnClearEvents = vi.fn();

  beforeEach(() => {
    mockOnClearEvents.mockClear();
  });

  describe('empty states', () => {
    it('shows "Not connected" when disconnected and no events', () => {
      render(
        <EventFeedSidebar events={[]} isConnected={false} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText('Not connected')).toBeInTheDocument();
    });

    it('shows "Waiting for events..." when connected but no events', () => {
      render(<EventFeedSidebar events={[]} isConnected={true} onClearEvents={mockOnClearEvents} />);

      expect(screen.getByText('Waiting for events...')).toBeInTheDocument();
    });

    it('shows "No events match filters" when filters active but no matches', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }),
        createMockEvent({ type: 'NODE_HEARTBEAT' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Open severity filter and select 'error' (no events match)
      const severityTrigger = screen.getAllByRole('combobox')[1];
      await user.click(severityTrigger);

      const errorOption = screen.getByRole('option', { name: 'Error' });
      await user.click(errorOption);

      expect(screen.getByText('No events match filters')).toBeInTheDocument();
    });
  });

  describe('event display', () => {
    it('renders events with formatted type names', () => {
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }),
        createMockEvent({ type: 'INSTANCE_HEALTH_CHANGED' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText('Node Registered')).toBeInTheDocument();
      expect(screen.getByText('Instance Health Changed')).toBeInTheDocument();
    });

    it('displays event count badge', () => {
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }),
        createMockEvent({ type: 'NODE_HEARTBEAT' }),
        createMockEvent({ type: 'INSTANCE_ADDED' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('displays last event time when provided', () => {
      const lastEventTime = new Date('2024-01-15T14:30:45');

      render(
        <EventFeedSidebar
          events={[createMockEvent()]}
          isConnected={true}
          onClearEvents={mockOnClearEvents}
          lastEventTime={lastEventTime}
        />
      );

      expect(screen.getByText(/Last event:/)).toBeInTheDocument();
    });
  });

  describe('type filtering', () => {
    it('filters events by type when filter is selected', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ id: 'reg-1', type: 'NODE_REGISTERED' }),
        createMockEvent({ id: 'hb-1', type: 'NODE_HEARTBEAT' }),
        createMockEvent({ id: 'hb-2', type: 'NODE_HEARTBEAT' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Initially all events visible
      expect(screen.getByText('Node Registered')).toBeInTheDocument();
      expect(screen.getAllByText('Node Heartbeat')).toHaveLength(2);

      // Open type filter dropdown
      const typeFilterTrigger = screen.getAllByRole('combobox')[0];
      await user.click(typeFilterTrigger);

      // Select 'Heartbeat' filter
      const heartbeatOption = screen.getByRole('option', { name: 'Heartbeat' });
      await user.click(heartbeatOption);

      // Only heartbeat events should be visible
      expect(screen.queryByText('Node Registered')).not.toBeInTheDocument();
      expect(screen.getAllByText('Node Heartbeat')).toHaveLength(2);
    });

    it('shows filtered/total count when type filter is active', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }),
        createMockEvent({ type: 'NODE_HEARTBEAT' }),
        createMockEvent({ type: 'NODE_HEARTBEAT' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Initially shows total count
      expect(screen.getByText('3')).toBeInTheDocument();

      // Apply type filter
      const typeFilterTrigger = screen.getAllByRole('combobox')[0];
      await user.click(typeFilterTrigger);

      const heartbeatOption = screen.getByRole('option', { name: 'Heartbeat' });
      await user.click(heartbeatOption);

      // Should show filtered/total format
      expect(screen.getByText('2/3')).toBeInTheDocument();
    });
  });

  describe('severity filtering', () => {
    it('filters events by severity when filter is selected', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }), // info
        createMockEvent({ type: 'NODE_DEREGISTERED' }), // warning
        createMockEvent({
          type: 'INSTANCE_HEALTH_CHANGED',
          payload: { new_health: 'critical' },
        }), // error
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Open severity filter dropdown
      const severityFilterTrigger = screen.getAllByRole('combobox')[1];
      await user.click(severityFilterTrigger);

      // Select 'Warning' filter
      const warningOption = screen.getByRole('option', { name: 'Warning' });
      await user.click(warningOption);

      // Only warning events should be visible
      expect(screen.queryByText('Node Registered')).not.toBeInTheDocument();
      expect(screen.getByText('Node Deregistered')).toBeInTheDocument();
      expect(screen.queryByText('Instance Health Changed')).not.toBeInTheDocument();
    });

    it('filters for error severity events', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }), // info
        createMockEvent({
          type: 'INSTANCE_HEALTH_CHANGED',
          payload: { new_health: 'critical' },
        }), // error
        createMockEvent({
          type: 'INSTANCE_HEALTH_CHANGED',
          payload: { new_health: 'dead' },
        }), // error
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Open severity filter dropdown
      const severityFilterTrigger = screen.getAllByRole('combobox')[1];
      await user.click(severityFilterTrigger);

      // Select 'Error' filter
      const errorOption = screen.getByRole('option', { name: 'Error' });
      await user.click(errorOption);

      // Only error events should be visible (both INSTANCE_HEALTH_CHANGED with critical/dead)
      expect(screen.queryByText('Node Registered')).not.toBeInTheDocument();
      expect(screen.getAllByText('Instance Health Changed')).toHaveLength(2);
    });
  });

  describe('combined filtering', () => {
    it('applies both type and severity filters', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }), // info
        createMockEvent({ type: 'NODE_DEREGISTERED' }), // warning
        createMockEvent({ type: 'INSTANCE_REMOVED' }), // warning
        createMockEvent({
          type: 'INSTANCE_HEALTH_CHANGED',
          payload: { new_health: 'degraded' },
        }), // warning
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Apply severity filter: warning
      const severityFilterTrigger = screen.getAllByRole('combobox')[1];
      await user.click(severityFilterTrigger);
      const warningOption = screen.getByRole('option', { name: 'Warning' });
      await user.click(warningOption);

      // Now 3 events should be visible (NODE_DEREGISTERED, INSTANCE_REMOVED, INSTANCE_HEALTH_CHANGED)
      expect(screen.getByText('3/4')).toBeInTheDocument();

      // Apply type filter: Instance Removed
      const typeFilterTrigger = screen.getAllByRole('combobox')[0];
      await user.click(typeFilterTrigger);
      const instanceRemovedOption = screen.getByRole('option', { name: 'Instance Removed' });
      await user.click(instanceRemovedOption);

      // Only 1 event should be visible (INSTANCE_REMOVED with warning severity)
      expect(screen.getByText('1/4')).toBeInTheDocument();
      // Use getAllByText since the text appears in both the dropdown and the event card
      const instanceRemovedTexts = screen.getAllByText('Instance Removed');
      expect(instanceRemovedTexts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('clear filters', () => {
    it('shows clear filters button when filters are active', async () => {
      const user = userEvent.setup();
      const events = [createMockEvent({ type: 'NODE_REGISTERED' })];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Initially no clear filters button
      const clearButton = screen.queryByTitle('Clear filters');
      expect(clearButton).not.toBeInTheDocument();

      // Apply a filter
      const typeFilterTrigger = screen.getAllByRole('combobox')[0];
      await user.click(typeFilterTrigger);
      const registeredOption = screen.getByRole('option', { name: 'Registered' });
      await user.click(registeredOption);

      // Clear filters button should now be visible
      expect(screen.getByTitle('Clear filters')).toBeInTheDocument();
    });

    it('resets both filters when clear button is clicked', async () => {
      const user = userEvent.setup();
      const events = [
        createMockEvent({ type: 'NODE_REGISTERED' }),
        createMockEvent({ type: 'NODE_HEARTBEAT' }),
        createMockEvent({ type: 'NODE_DEREGISTERED' }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Apply type filter
      const typeFilterTrigger = screen.getAllByRole('combobox')[0];
      await user.click(typeFilterTrigger);
      const heartbeatOption = screen.getByRole('option', { name: 'Heartbeat' });
      await user.click(heartbeatOption);

      // Apply severity filter
      const severityFilterTrigger = screen.getAllByRole('combobox')[1];
      await user.click(severityFilterTrigger);
      const infoOption = screen.getByRole('option', { name: 'Info' });
      await user.click(infoOption);

      // Verify filtered state
      expect(screen.getByText('1/3')).toBeInTheDocument();

      // Click clear filters
      const clearFiltersButton = screen.getByTitle('Clear filters');
      await user.click(clearFiltersButton);

      // All events should be visible again
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Node Registered')).toBeInTheDocument();
      expect(screen.getByText('Node Heartbeat')).toBeInTheDocument();
      expect(screen.getByText('Node Deregistered')).toBeInTheDocument();
    });
  });

  describe('clear events button', () => {
    it('calls onClearEvents when clear button is clicked', async () => {
      const user = userEvent.setup();
      const events = [createMockEvent({ type: 'NODE_REGISTERED' })];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      // Find and click the trash button (clear events)
      const clearButton = screen.getByRole('button', { name: 'Clear events' });
      await user.click(clearButton);

      expect(mockOnClearEvents).toHaveBeenCalledTimes(1);
    });

    it('does not show clear button when no events', () => {
      render(<EventFeedSidebar events={[]} isConnected={true} onClearEvents={mockOnClearEvents} />);

      // The trash button should not be present when there are no events
      const buttons = screen.queryAllByRole('button');
      // Filter dropdowns are not buttons, so we should have no buttons for clearing
      expect(buttons.length).toBe(0);
    });
  });

  describe('event payload display', () => {
    it('displays node_id when present in payload', () => {
      const events = [
        createMockEvent({
          type: 'NODE_REGISTERED',
          payload: { node_id: 'test-node-123' },
        }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText('test-node-123')).toBeInTheDocument();
    });

    it('displays instance_id when present in payload', () => {
      const events = [
        createMockEvent({
          type: 'INSTANCE_ADDED',
          payload: { instance_id: 'instance-456' },
        }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText('instance-456')).toBeInTheDocument();
    });

    it('displays state transition when new_state is in payload', () => {
      const events = [
        createMockEvent({
          type: 'NODE_STATE_CHANGED',
          payload: { previous_state: 'idle', new_state: 'running' },
        }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText(/idle/)).toBeInTheDocument();
      expect(screen.getByText(/running/)).toBeInTheDocument();
    });

    it('displays health transition when new_health is in payload', () => {
      const events = [
        createMockEvent({
          type: 'INSTANCE_HEALTH_CHANGED',
          payload: { previous_health: 'healthy', new_health: 'degraded' },
        }),
      ];

      render(
        <EventFeedSidebar events={events} isConnected={true} onClearEvents={mockOnClearEvents} />
      );

      expect(screen.getByText(/healthy/)).toBeInTheDocument();
      expect(screen.getByText(/degraded/)).toBeInTheDocument();
    });
  });

  describe('maxEvents prop', () => {
    it('respects maxEvents limit', () => {
      const events = Array.from({ length: 10 }, (_, i) =>
        createMockEvent({
          id: `event-${i}`,
          type: 'NODE_HEARTBEAT',
        })
      );

      render(
        <EventFeedSidebar
          events={events}
          isConnected={true}
          onClearEvents={mockOnClearEvents}
          maxEvents={3}
        />
      );

      // Only 3 events should be rendered
      const eventItems = screen.getAllByText('Node Heartbeat');
      expect(eventItems).toHaveLength(3);
    });
  });
});
