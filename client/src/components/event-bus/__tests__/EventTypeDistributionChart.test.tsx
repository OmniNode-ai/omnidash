/**
 * Tests for EventTypeDistributionChart Component
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventTypeDistributionChart } from '../EventTypeDistributionChart';
import type { EventBusEvent } from '@/lib/data-sources';

const mockEvents: EventBusEvent[] = [
  {
    event_type: 'omninode.intelligence.query.requested.v1',
    event_id: 'evt-1',
    timestamp: new Date().toISOString(),
    tenant_id: 'tenant-1',
    namespace: 'development',
    source: 'omniarchon',
    correlation_id: 'corr-123',
    schema_ref: 'registry://omninode/intelligence/query_requested/v1',
    payload: {},
    topic: 'tenant-1.omninode.intelligence.v1',
    partition: 0,
    offset: '100',
    processed_at: new Date().toISOString(),
  },
  {
    event_type: 'omninode.agent.execution.started.v1',
    event_id: 'evt-2',
    timestamp: new Date().toISOString(),
    tenant_id: 'tenant-1',
    namespace: 'development',
    source: 'polymorphic-agent',
    correlation_id: 'corr-456',
    schema_ref: 'registry://omninode/agent/execution_started/v1',
    payload: {},
    topic: 'tenant-1.omninode.agent.v1',
    partition: 0,
    offset: '200',
    processed_at: new Date().toISOString(),
  },
];

describe('EventTypeDistributionChart', () => {
  it('should render distribution chart', () => {
    render(<EventTypeDistributionChart events={mockEvents} />);

    expect(screen.getByText('Event Type Distribution')).toBeInTheDocument();
  });

  it('should display top event types', () => {
    render(<EventTypeDistributionChart events={mockEvents} />);

    expect(screen.getByText('Top Event Types')).toBeInTheDocument();
  });

  it('should filter by tenant', () => {
    render(<EventTypeDistributionChart events={mockEvents} />);

    expect(screen.getByText('All Tenants')).toBeInTheDocument();
  });
});
