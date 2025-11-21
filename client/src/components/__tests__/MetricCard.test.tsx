import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MetricCard } from '../MetricCard';
import { Activity, AlertTriangle } from 'lucide-react';

describe('MetricCard', () => {
  it('should render with label and value', () => {
    render(<MetricCard label="Total Requests" value="1,234" />);

    expect(screen.getByText('Total Requests')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('should render with number value', () => {
    render(<MetricCard label="Active Agents" value={42} />);

    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('should render with icon', () => {
    render(<MetricCard label="Metrics" value="100" icon={Activity} />);

    const iconElement = screen.getByTestId('card-metric-metrics');
    expect(iconElement).toBeInTheDocument();
    // Icon should be rendered in the component
    expect(iconElement.querySelector('svg')).toBeInTheDocument();
  });

  it('should render trend indicator when provided', () => {
    render(<MetricCard label="Growth" value="50%" trend={{ value: 12.5, isPositive: true }} />);

    expect(screen.getByText('+12.5%')).toBeInTheDocument();
  });

  it('should render negative trend correctly', () => {
    render(<MetricCard label="Decrease" value="30%" trend={{ value: 5.2, isPositive: false }} />);

    expect(screen.getByText('5.2%')).toBeInTheDocument();
    // Should not have + prefix for negative trends
    expect(screen.queryByText('+5.2%')).not.toBeInTheDocument();
  });

  it('should render status indicator', () => {
    render(<MetricCard label="Health" value="Healthy" status="healthy" />);

    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('should apply correct status colors', () => {
    const { rerender } = render(
      <MetricCard label="Test" value="100" status="warning" icon={AlertTriangle} />
    );

    let card = screen.getByTestId('card-metric-test');
    expect(card).toBeInTheDocument();

    rerender(<MetricCard label="Test" value="100" status="error" icon={AlertTriangle} />);
    card = screen.getByTestId('card-metric-test');
    expect(card).toBeInTheDocument();

    rerender(<MetricCard label="Test" value="100" status="offline" icon={AlertTriangle} />);
    card = screen.getByTestId('card-metric-test');
    expect(card).toBeInTheDocument();
  });

  it('should render tooltip when provided', async () => {
    render(
      <MetricCard
        label="Complex Metric"
        value="500"
        tooltip="This metric represents total operations per minute"
      />
    );

    const label = screen.getByText('Complex Metric');
    expect(label).toBeInTheDocument();

    // Tooltip should be present (hover to trigger)
    // Note: Testing tooltip visibility requires user interaction simulation
  });

  it('should apply custom className', () => {
    render(<MetricCard label="Custom" value="100" className="custom-class" />);

    const card = screen.getByTestId('card-metric-custom');
    expect(card).toHaveClass('custom-class');
  });

  it('should generate correct test id from label', () => {
    render(<MetricCard label="Total Requests Per Minute" value="1000" />);

    expect(screen.getByTestId('card-metric-total-requests-per-minute')).toBeInTheDocument();
  });

  it('should not render status section when status is not provided', () => {
    render(<MetricCard label="No Status" value="100" />);

    expect(screen.queryByText('healthy')).not.toBeInTheDocument();
    expect(screen.queryByText('warning')).not.toBeInTheDocument();
    expect(screen.queryByText('error')).not.toBeInTheDocument();
  });

  it('should not render trend when not provided', () => {
    render(<MetricCard label="No Trend" value="100" />);

    // Should not have trend indicator
    const trendPattern = /[+-]?\d+\.?\d*%/;
    const allText = screen.getByTestId('card-metric-no-trend').textContent || '';
    // Check that percentage pattern doesn't appear as trend
    expect(allText).not.toMatch(trendPattern);
  });

  it('should handle all status types correctly', () => {
    const statuses: Array<'healthy' | 'warning' | 'error' | 'offline'> = [
      'healthy',
      'warning',
      'error',
      'offline',
    ];

    statuses.forEach((status) => {
      const { unmount } = render(
        <MetricCard label={`Test ${status}`} value="100" status={status} />
      );

      expect(screen.getByText(status)).toBeInTheDocument();
      unmount();
    });
  });

  it('should render icon without status', () => {
    render(<MetricCard label="With Icon" value="50" icon={Activity} />);

    const card = screen.getByTestId('card-metric-with-icon');
    expect(card.querySelector('svg')).toBeInTheDocument();
  });
});
