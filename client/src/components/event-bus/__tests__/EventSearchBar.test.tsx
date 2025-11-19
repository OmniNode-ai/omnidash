/**
 * Tests for EventSearchBar Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventSearchBar } from '../EventSearchBar';

describe('EventSearchBar', () => {
  it('should render search bar', () => {
    const onFilterChange = vi.fn();
    render(<EventSearchBar onFilterChange={onFilterChange} />);
    
    expect(screen.getByText('Search & Filter Events')).toBeInTheDocument();
  });

  it('should call onFilterChange when filters change', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<EventSearchBar onFilterChange={onFilterChange} eventTypes={['type1', 'type2']} />);
    
    // Wait for initial filter change
    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalled();
    });
  });

  it('should show advanced filters when toggled', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<EventSearchBar onFilterChange={onFilterChange} />);
    
    const toggleButton = screen.getByText(/Show Advanced/);
    await user.click(toggleButton);
    
    expect(screen.getByText(/Hide Advanced/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tenant ID/)).toBeInTheDocument();
  });

  it('should disable clear button when no filters are active', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<EventSearchBar onFilterChange={onFilterChange} eventTypes={['type1']} />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByText('Search & Filter Events')).toBeInTheDocument();
    });

    // Clear button should be disabled when no filters are active initially
    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeDisabled();
  });

  it('should clear filters when clear button is clicked', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(<EventSearchBar onFilterChange={onFilterChange} eventTypes={['type1', 'type2']} />);

    // Show advanced filters to access all filter fields
    const toggleButton = screen.getByText(/Show Advanced/);
    await user.click(toggleButton);

    // Set multiple filters
    const eventTypeSelect = screen.getByLabelText(/Event Type/);
    await user.click(eventTypeSelect);
    const type1Option = screen.getByRole('option', { name: 'type1' });
    await user.click(type1Option);

    const correlationInput = screen.getByLabelText(/Correlation ID/);
    await user.type(correlationInput, 'test-correlation-123');

    const tenantInput = screen.getByLabelText(/Tenant ID/);
    await user.type(tenantInput, 'tenant-456');

    const sourceInput = screen.getByLabelText(/Source/);
    await user.type(sourceInput, 'test-source');

    // Wait for filters to be applied and verify clear button is enabled
    await waitFor(() => {
      const clearButton = screen.getByText('Clear');
      expect(clearButton).not.toBeDisabled();
    });

    // Click clear button
    const clearButton = screen.getByText('Clear');
    await user.click(clearButton);

    // Verify filters are cleared
    await waitFor(() => {
      expect(correlationInput).toHaveValue('');
      expect(tenantInput).toHaveValue('');
      expect(sourceInput).toHaveValue('');
    });

    // Verify onFilterChange was called with default filters (no optional filters)
    await waitFor(() => {
      const lastCall = onFilterChange.mock.calls[onFilterChange.mock.calls.length - 1][0];
      expect(lastCall).toBeDefined();
      expect(lastCall.event_types).toBeUndefined();
      expect(lastCall.correlation_id).toBeUndefined();
      expect(lastCall.tenant_id).toBeUndefined();
      expect(lastCall.source).toBeUndefined();
      expect(lastCall.limit).toBe(100);
      expect(lastCall.order_by).toBe('timestamp');
      expect(lastCall.order_direction).toBe('desc');
    });

    // Verify clear button is disabled again
    expect(clearButton).toBeDisabled();
  });
});

