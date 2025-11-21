/**
 * Tests for EventPayloadViewer Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventPayloadViewer } from '../EventPayloadViewer';

describe('EventPayloadViewer', () => {
  const mockPayload = {
    query: 'test query',
    user_id: 'user-123',
    results: {
      count: 5,
      items: ['item1', 'item2'],
    },
  };

  it('should render payload viewer', () => {
    render(<EventPayloadViewer payload={mockPayload} />);

    expect(screen.getByText('Event Payload')).toBeInTheDocument();
  });

  it('should display payload data', () => {
    render(<EventPayloadViewer payload={mockPayload} />);

    expect(screen.getByText(/test query/)).toBeInTheDocument();
  });

  it('should copy JSON to clipboard', async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    render(<EventPayloadViewer payload={mockPayload} />);

    const copyButton = screen.getByText('Copy JSON');
    await user.click(copyButton);

    expect(writeTextSpy).toHaveBeenCalledWith(JSON.stringify(mockPayload, null, 2));
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('should filter payload by search term', async () => {
    const user = userEvent.setup();
    render(<EventPayloadViewer payload={mockPayload} />);

    const searchInput = screen.getByPlaceholderText('Search payload...');
    await user.type(searchInput, 'query');

    // The filtered view should still show matching content
    expect(screen.getByText(/test query/)).toBeInTheDocument();
  });
});
