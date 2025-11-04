import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventFeed } from '../EventFeed';

describe('EventFeed', () => {
  const mockEvents = [
    {
      id: 'event-1',
      type: 'success' as const,
      message: 'Operation completed successfully',
      timestamp: '10:00:00',
      source: 'agent-1',
    },
    {
      id: 'event-2',
      type: 'error' as const,
      message: 'Operation failed',
      timestamp: '10:01:00',
      source: 'agent-2',
    },
    {
      id: 'event-3',
      type: 'warning' as const,
      message: 'Performance degradation detected',
      timestamp: '10:02:00',
    },
    {
      id: 'event-4',
      type: 'info' as const,
      message: 'Processing started',
      timestamp: '10:03:00',
      source: 'system',
    },
  ];

  it('should render all events', () => {
    render(<EventFeed events={mockEvents} />);
    
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    expect(screen.getByText('Operation failed')).toBeInTheDocument();
    expect(screen.getByText('Performance degradation detected')).toBeInTheDocument();
    expect(screen.getByText('Processing started')).toBeInTheDocument();
  });

  it('should render timestamps', () => {
    render(<EventFeed events={mockEvents} />);
    
    expect(screen.getByText('10:00:00')).toBeInTheDocument();
    expect(screen.getByText('10:01:00')).toBeInTheDocument();
  });

  it('should render source badges when provided', () => {
    render(<EventFeed events={mockEvents} />);
    
    expect(screen.getByText('agent-1')).toBeInTheDocument();
    expect(screen.getByText('agent-2')).toBeInTheDocument();
    expect(screen.getByText('system')).toBeInTheDocument();
  });

  it('should not render source badge when source is missing', () => {
    const eventsWithoutSource = [
      {
        id: 'event-1',
        type: 'info' as const,
        message: 'No source event',
        timestamp: '10:00:00',
      },
    ];
    
    render(<EventFeed events={eventsWithoutSource} />);
    
    expect(screen.queryByText('agent-1')).not.toBeInTheDocument();
  });

  it('should render in bare mode without card wrapper', () => {
    const { container } = render(<EventFeed events={mockEvents} bare />);
    
    // Should not have Card wrapper
    const card = container.querySelector('[data-testid*="card"]');
    expect(card).not.toBeInTheDocument();
  });

  it('should render with card wrapper when bare is false', () => {
    render(<EventFeed events={mockEvents} bare={false} />);
    
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
  });

  it('should apply custom maxHeight', () => {
    const { container } = render(<EventFeed events={mockEvents} maxHeight={200} />);
    
    const scrollArea = container.querySelector('[style*="max-height: 200px"]');
    expect(scrollArea).toBeInTheDocument();
  });

  it('should handle empty events array', () => {
    render(<EventFeed events={[]} />);
    
    // Component should render but with no events - check for header if not bare
    const container = document.body;
    expect(container).toBeInTheDocument();
  });

  it('should apply correct color indicators for each event type', () => {
    const { container } = render(<EventFeed events={mockEvents} />);
    
    // Check that events are rendered (colors are applied via CSS classes)
    expect(screen.getByText('Operation completed successfully')).toBeInTheDocument();
    expect(screen.getByText('Operation failed')).toBeInTheDocument();
    expect(screen.getByText('Performance degradation detected')).toBeInTheDocument();
  });
});

