import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StatusLegend } from '../StatusLegend';

describe('StatusLegend', () => {
  it('should render all status indicators', () => {
    render(<StatusLegend />);

    expect(screen.getByText('Healthy (within threshold)')).toBeInTheDocument();
    expect(screen.getByText('Warning (exceeds threshold)')).toBeInTheDocument();
    expect(screen.getByText('Critical (severely degraded)')).toBeInTheDocument();
  });

  it('should render status dots', () => {
    const { container } = render(<StatusLegend />);

    // Should have 3 status dots
    const dots = container.querySelectorAll('.w-3.h-3.rounded-full');
    expect(dots.length).toBe(3);
  });

  it('should apply correct colors to status dots', () => {
    const { container } = render(<StatusLegend />);

    const healthyDot = container.querySelector('.bg-status-healthy');
    const warningDot = container.querySelector('.bg-status-warning');
    const errorDot = container.querySelector('.bg-status-error');

    expect(healthyDot).toBeInTheDocument();
    expect(warningDot).toBeInTheDocument();
    expect(errorDot).toBeInTheDocument();
  });

  it('should have proper layout structure', () => {
    const { container } = render(<StatusLegend />);

    // Should have flex layout with gap
    const legend = container.querySelector('.flex.gap-6');
    expect(legend).toBeInTheDocument();
  });
});
