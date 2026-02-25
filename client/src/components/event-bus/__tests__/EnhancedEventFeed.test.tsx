/**
 * Tests for EnhancedEventFeed Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedEventFeed } from '../EnhancedEventFeed';
import type { EventBusEvent } from '@/lib/data-sources';

const mockEvents: EventBusEvent[] = [
  {
    event_type: 'omninode.intelligence.query.requested.v1',
    event_id: 'evt-1',
    timestamp: new Date().toISOString(),
    tenant_id: 'default-tenant',
    namespace: 'development',
    source: 'omniintelligence',
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
    source: 'omniintelligence',
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

describe('EnhancedEventFeed', () => {
  it('should render event feed', () => {
    render(<EnhancedEventFeed events={mockEvents} />);

    expect(screen.getByText('Live Event Stream')).toBeInTheDocument();
  });

  it('should group events by correlation ID', () => {
    render(<EnhancedEventFeed events={mockEvents} />);

    expect(screen.getByText(/Correlation:/)).toBeInTheDocument();
  });

  it('should toggle grouping', async () => {
    const user = userEvent.setup();
    render(<EnhancedEventFeed events={mockEvents} />);

    const toggleButton = screen.getByText('Ungroup');
    await user.click(toggleButton);

    expect(screen.getByText('Group by Correlation')).toBeInTheDocument();
  });

  it('should call onEventClick when event is clicked', async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();
    render(<EnhancedEventFeed events={mockEvents} onEventClick={onEventClick} />);

    // Find event using role-based selector with specific aria-label pattern
    const eventButtons = screen.getAllByRole('button', {
      name: /View details for event omninode\.intelligence/,
    });
    expect(eventButtons.length).toBeGreaterThan(0);
    await user.click(eventButtons[0]);
    expect(onEventClick).toHaveBeenCalledWith(mockEvents[0]);
  });

  it('should call onCorrelationClick when correlation button is clicked', async () => {
    const user = userEvent.setup();
    const onCorrelationClick = vi.fn();
    render(<EnhancedEventFeed events={mockEvents} onCorrelationClick={onCorrelationClick} />);

    const viewChainButton = screen.getByText('View Chain');
    await user.click(viewChainButton);

    expect(onCorrelationClick).toHaveBeenCalledWith('corr-123');
  });
});
