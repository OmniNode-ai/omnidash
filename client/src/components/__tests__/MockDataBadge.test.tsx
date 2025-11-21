import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MockDataBadge } from '../MockDataBadge';

describe('MockDataBadge', () => {
  it('should render badge with text', () => {
    render(<MockDataBadge />);

    expect(screen.getByText('Mock Data Active')).toBeInTheDocument();
  });

  it('should render indicator dot', () => {
    const { container } = render(<MockDataBadge />);

    // Should have the yellow indicator dot
    const dot = container.querySelector('.w-1\\.5.h-1\\.5.rounded-full.bg-yellow-400');
    expect(dot).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(<MockDataBadge className="custom-class mb-4" />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('custom-class');
    expect(badge).toHaveClass('mb-4');
  });

  it('should have yellow styling', () => {
    const { container } = render(<MockDataBadge />);

    const badge = container.querySelector('span');
    expect(badge).toHaveClass('bg-yellow-500/10');
    expect(badge).toHaveClass('border-yellow-500/30');
    expect(badge).toHaveClass('text-yellow-400');
  });

  it('should render without custom className', () => {
    render(<MockDataBadge />);

    expect(screen.getByText('Mock Data Active')).toBeInTheDocument();
  });
});
