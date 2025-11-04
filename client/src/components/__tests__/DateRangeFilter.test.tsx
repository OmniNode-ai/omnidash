import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DateRangeFilter, DateRangeValue } from '../DateRangeFilter';

describe('DateRangeFilter', () => {
  it('should render with preset selector', () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: '24h' };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should render custom date inputs when preset is "custom"', () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: 'custom' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(2);
    expect(screen.getByText('to')).toBeInTheDocument();
  });

  it('should not render date inputs for preset ranges', () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: '7d' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(0);
  });

  it('should call onChange when start date changes', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: 'custom', start: '', end: '' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const startInput = dateInputs[0] as HTMLInputElement;
    await user.type(startInput, '2025-01-01');

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  it('should call onChange when end date changes', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: 'custom', start: '', end: '' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const endInput = dateInputs[1] as HTMLInputElement;
    await user.type(endInput, '2025-01-31');

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalled();
    });
  });

  it('should show error when end date is before start date', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-15',
      end: '2025-01-10'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.getByTestId('date-range-error')).toBeInTheDocument();
      expect(screen.getByText('End date must be on or after start date')).toBeInTheDocument();
    });
  });

  it('should not show error when end date equals start date (same day)', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-15',
      end: '2025-01-15'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should not show error when end date is after start date', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-10',
      end: '2025-01-20'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should not show error when dates are empty', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: undefined,
      end: undefined
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should not show error when only start date is provided', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-15',
      end: undefined
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should not show error when only end date is provided', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: undefined,
      end: '2025-01-15'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should apply error styling to inputs when validation fails', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-20',
      end: '2025-01-10'
    };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      const inputs = container.querySelectorAll('input[type="date"]');
      expect(inputs[0]).toHaveClass('border-red-500');
      expect(inputs[1]).toHaveClass('border-red-500');
    });
  });

  it('should set aria-invalid when validation fails', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-20',
      end: '2025-01-10'
    };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      const inputs = container.querySelectorAll('input[type="date"]');
      expect(inputs[0]).toHaveAttribute('aria-invalid', 'true');
      expect(inputs[1]).toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('should display AlertCircle icon in error message', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-20',
      end: '2025-01-10'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      const errorDiv = screen.getByTestId('date-range-error');
      expect(errorDiv.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('should have role="alert" on error message for accessibility', async () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = {
      preset: 'custom',
      start: '2025-01-20',
      end: '2025-01-10'
    };

    render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    await waitFor(() => {
      const errorDiv = screen.getByTestId('date-range-error');
      expect(errorDiv).toHaveAttribute('role', 'alert');
    });
  });

  it('should clear error when switching from custom to preset', async () => {
    const mockOnChange = vi.fn();
    const { rerender } = render(
      <DateRangeFilter
        value={{ preset: 'custom', start: '2025-01-20', end: '2025-01-10' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('date-range-error')).toBeInTheDocument();
    });

    rerender(
      <DateRangeFilter
        value={{ preset: '7d' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });
  });

  it('should clear dates when switching from custom to preset', () => {
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: '24h' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    // When switching to a preset, date inputs should not be rendered
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs).toHaveLength(0);
  });

  it('should handle rapid date changes correctly', async () => {
    const user = userEvent.setup();
    const mockOnChange = vi.fn();
    const value: DateRangeValue = { preset: 'custom', start: '', end: '' };

    const { container } = render(<DateRangeFilter value={value} onChange={mockOnChange} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');
    const startInput = dateInputs[0] as HTMLInputElement;
    const endInput = dateInputs[1] as HTMLInputElement;

    // Rapidly change both dates
    await user.type(startInput, '2025-01-01');
    await user.type(endInput, '2025-01-31');

    // Should handle multiple calls
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('should validate dates with different formats', async () => {
    const mockOnChange = vi.fn();

    // Test valid ISO format
    const { rerender } = render(
      <DateRangeFilter
        value={{ preset: 'custom', start: '2025-01-01', end: '2025-12-31' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument();
    });

    // Test invalid date order
    rerender(
      <DateRangeFilter
        value={{ preset: 'custom', start: '2025-12-31', end: '2025-01-01' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('date-range-error')).toBeInTheDocument();
    });
  });

  it('should maintain error state across re-renders', async () => {
    const mockOnChange = vi.fn();
    const { rerender } = render(
      <DateRangeFilter
        value={{ preset: 'custom', start: '2025-01-20', end: '2025-01-10' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('date-range-error')).toBeInTheDocument();
    });

    // Re-render with same invalid values
    rerender(
      <DateRangeFilter
        value={{ preset: 'custom', start: '2025-01-20', end: '2025-01-10' }}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('date-range-error')).toBeInTheDocument();
    });
  });
});
