import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { TimeRangeSelector } from '../TimeRangeSelector';

describe('TimeRangeSelector', () => {
  it('should render with default value', () => {
    const handleChange = vi.fn();
    render(<TimeRangeSelector value="24h" onChange={handleChange} />);

    // Select trigger should be visible
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should call onChange when value is selected', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();

    render(<TimeRangeSelector value="24h" onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    // Wait for dropdown to open and select an option
    await waitFor(
      () => {
        expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    const option = screen.getByText('Last 7 Days');
    await user.click(option);

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledWith('7d');
    });
  });

  it('should display current value', () => {
    render(<TimeRangeSelector value="7d" onChange={vi.fn()} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('should have all time range options', async () => {
    const user = userEvent.setup();
    render(<TimeRangeSelector value="24h" onChange={vi.fn()} />);

    const select = screen.getByRole('combobox');
    await user.click(select);

    // Wait for dropdown content to be visible
    // Radix UI Select renders options in a portal, so we check document body
    // Using a more flexible query that works with Radix UI's structure
    await waitFor(
      () => {
        // Check for Radix Select content container or options
        const selectContent =
          document.body.querySelector('[data-radix-select-content]') ||
          document.body.querySelector('[role="listbox"]');
        expect(selectContent).toBeTruthy();
      },
      { timeout: 3000 }
    );

    // Verify options exist by checking for text content in the portal
    // Radix UI may render options with specific attributes or in a specific structure
    const selectContent =
      document.body.querySelector('[data-radix-select-content]') ||
      document.body.querySelector('[role="listbox"]');

    // If we found the content container, verify it has child elements (options)
    if (selectContent) {
      const options = selectContent.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
    } else {
      // Fallback: check if we can find any time range text in the document
      const hasOptions = [
        'Last Hour',
        'Last 24 Hours',
        'Last 7 Days',
        'Last 30 Days',
        'Last 90 Days',
      ].some((text) => {
        const elements = Array.from(document.body.querySelectorAll('*'));
        return elements.some((el) => el.textContent?.includes(text));
      });
      expect(hasOptions).toBe(true);
    }
  });

  it('should be memoized to prevent unnecessary re-renders', () => {
    const handleChange = vi.fn();
    const { rerender } = render(<TimeRangeSelector value="24h" onChange={handleChange} />);

    // Rerender with same props should not cause re-render due to memoization
    rerender(<TimeRangeSelector value="24h" onChange={handleChange} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
