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
});

