import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DashboardGrid } from './DashboardGrid';
import type { DashboardLayoutItem } from '@shared/types/dashboard';

const layout: DashboardLayoutItem[] = [
  { i: 'item-1', componentName: 'cost-trend-panel', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 4, config: {} },
  { i: 'item-2', componentName: 'unknown-widget', componentVersion: '1.0.0', x: 6, y: 0, w: 6, h: 4, config: {} },
];

describe('DashboardGrid', () => {
  it('renders layout items', () => {
    render(
      <DashboardGrid
        layout={layout}
        editMode={false}
        resolveComponent={() => undefined}
      />
    );
    expect(screen.getAllByTestId('grid-item').length).toBe(2);
  });

  it('shows placeholder for unresolved components', () => {
    render(
      <DashboardGrid
        layout={layout}
        editMode={false}
        resolveComponent={() => undefined}
      />
    );
    const placeholders = screen.getAllByText(/not available/i);
    expect(placeholders.length).toBe(2);
  });
});
