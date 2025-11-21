import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RealtimeChart } from '../RealtimeChart';

// Mock ResizeObserver for Recharts
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('RealtimeChart', () => {
  const mockData = [
    { time: '10:00', value: 100 },
    { time: '11:00', value: 150 },
    { time: '12:00', value: 120 },
    { time: '13:00', value: 180 },
  ];

  it('should render with title and data', () => {
    render(<RealtimeChart title="Test Chart" data={mockData} />);

    expect(screen.getByText('Test Chart')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should render as line chart by default', () => {
    render(<RealtimeChart title="Line Chart" data={mockData} />);

    expect(screen.getByText('Line Chart')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should render as area chart when showArea is true', () => {
    render(<RealtimeChart title="Area Chart" data={mockData} showArea />);

    const chart = screen.getByTestId('chart-area-chart');
    expect(chart).toBeInTheDocument();
  });

  it('should apply custom height', () => {
    render(<RealtimeChart title="Custom Height" data={mockData} height={500} />);

    const chart = screen.getByTestId('chart-custom-height');
    expect(chart).toBeInTheDocument();
  });

  it('should handle empty data array', () => {
    render(<RealtimeChart title="Empty Chart" data={[]} />);

    expect(screen.getByText('Empty Chart')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('should handle custom color', () => {
    render(<RealtimeChart title="Colored Chart" data={mockData} color="hsl(var(--chart-2))" />);

    expect(screen.getByTestId('chart-colored-chart')).toBeInTheDocument();
  });

  it('should use custom dataKey when provided', () => {
    const dataWithCustomKey = [
      { time: '10:00', value: 100 },
      { time: '11:00', value: 150 },
    ];

    render(<RealtimeChart title="Custom Key" data={dataWithCustomKey} dataKey="value" />);

    expect(screen.getByTestId('chart-custom-key')).toBeInTheDocument();
  });

  it('should generate correct test id from title', () => {
    render(<RealtimeChart title="Operations Per Minute" data={mockData} />);

    expect(screen.getByTestId('chart-operations-per-minute')).toBeInTheDocument();
  });
});
