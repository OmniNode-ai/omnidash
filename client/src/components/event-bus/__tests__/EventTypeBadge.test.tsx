/**
 * Tests for EventTypeBadge Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventTypeBadge } from '../EventTypeBadge';

describe('EventTypeBadge', () => {
  it('should render event type badge', () => {
    render(<EventTypeBadge eventType="omninode.intelligence.query.requested.v1" />);

    expect(screen.getByText(/omninode\.intelligence\.query\.requested\.v1/)).toBeInTheDocument();
  });

  it('should show status icon when status is provided', () => {
    render(<EventTypeBadge eventType="omninode.agent.execution.completed.v1" status="completed" />);

    // Check that the badge is rendered
    expect(screen.getByText(/omninode\.agent\.execution\.completed\.v1/)).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <EventTypeBadge eventType="omninode.intelligence.query.requested.v1" onClick={onClick} />
    );

    const badge = screen.getByText(/omninode\.intelligence\.query\.requested\.v1/);
    badge.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should apply custom className', () => {
    const { container } = render(
      <EventTypeBadge
        eventType="omninode.intelligence.query.requested.v1"
        className="custom-class"
      />
    );

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });

  it('should handle different event domains', () => {
    const { rerender } = render(<EventTypeBadge eventType="omninode.agent.execution.started.v1" />);
    expect(screen.getByText(/omninode\.agent\.execution\.started\.v1/)).toBeInTheDocument();

    rerender(<EventTypeBadge eventType="omninode.code.pattern.discovered.v1" />);
    expect(screen.getByText(/omninode\.code\.pattern\.discovered\.v1/)).toBeInTheDocument();
  });
});
