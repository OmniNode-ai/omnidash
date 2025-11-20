/**
 * Tests for EventChainVisualization Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventChainVisualization } from '../EventChainVisualization';
import type { EventBusEvent } from '@/lib/data-sources';

const mockEvents: EventBusEvent[] = [
  {
    event_type: 'omninode.intelligence.query.requested.v1',
    event_id: 'evt-1',
    timestamp: new Date().toISOString(),
    tenant_id: 'default-tenant',
    namespace: 'development',
    source: 'omniarchon',
    correlation_id: 'corr-123',
    schema_ref: 'registry://omninode/intelligence/query_requested/v1',
    payload: { query: 'test' },
    topic: 'default-tenant.omninode.intelligence.v1',
    partition: 0,
    offset: '100',
    processed_at: new Date().toISOString(),
  },
  {
    event_type: 'omninode.intelligence.query.completed.v1',
    event_id: 'evt-2',
    timestamp: new Date().toISOString(),
    tenant_id: 'default-tenant',
    namespace: 'development',
    source: 'omniarchon',
    correlation_id: 'corr-123',
    causation_id: 'evt-1',
    schema_ref: 'registry://omninode/intelligence/query_completed/v1',
    payload: { results: 5 },
    topic: 'default-tenant.omninode.intelligence.v1',
    partition: 0,
    offset: '101',
    processed_at: new Date().toISOString(),
  },
];

describe('EventChainVisualization', () => {
  it('should render event chain', () => {
    render(<EventChainVisualization events={mockEvents} correlationId="corr-123" />);

    expect(screen.getByText(/Event Chain/)).toBeInTheDocument();
  });

  it('should show empty state when no events', () => {
    render(<EventChainVisualization events={[]} />);

    expect(screen.getByText(/No events in chain/)).toBeInTheDocument();
  });

  it('should call onEventClick when event is clicked', () => {
    const onEventClick = vi.fn();
    render(<EventChainVisualization events={mockEvents} onEventClick={onEventClick} />);

    // Find and click an event using data-testid
    const eventNodes = screen.getAllByTestId('event-chain-node');
    expect(eventNodes.length).toBeGreaterThan(0);
    eventNodes[0].click();
    expect(onEventClick).toHaveBeenCalledWith(mockEvents[0]);
  });

  it('should display correlation ID when provided', () => {
    render(<EventChainVisualization events={mockEvents} correlationId="corr-123" />);

    expect(screen.getByText(/corr-123/)).toBeInTheDocument();
  });
});
