// @vitest-environment jsdom
// OMN-25103 AC2/AC3: the Overview Running figure is the count of served floor-integration-rows.v1 rows marked running,
// and a failed or empty read shows Not measured with the reason, never 0. Drafted through onex delegate run 930765b7.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServedCountCard, type ServedRows, runningRowsCount } from '@/pages/local/served-count-card';

afterEach(cleanup);

function card(rows: ServedRows, failure: { reason: string } | null = null) {
  return render(<ServedCountCard label="Running" rows={rows} failure={failure} count={runningRowsCount(rows)} />).container;
}

describe('OMN-25103 Running figure from floor-integration-rows.v1', () => {
  it('running_figure_from_served_projection counts only rows marked running', () => {
    const container = card([
      { key: 'omnimarket#1', state: 'running' },
      { key: 'omnimarket#2', state: 'merged' },
      { key: 'omnibase_infra#3', state: 'running' },
      { key: 'omnidash#4', state: 'unintegrated' },
    ]);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('2');
  });

  it('running_figure_from_served_projection served rows with none running are a measured 0', () => {
    const container = card([{ key: 'omnimarket#1', state: 'merged' }, { key: 'omnimarket#2', state: 'merged' }]);
    const figure = container.querySelector('.local-dashboard-metric');
    expect(figure?.textContent).toBe('0');
    expect(figure?.getAttribute('data-measured')).toBe('true');
  });

  it('running_figure_unavailable failed read', () => {
    const container = card([], { reason: 'projection_unavailable' });
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('Not measured');
    expect(container.querySelector('.local-dashboard-caption')?.textContent).toContain('projection_unavailable');
    expect(container.textContent).not.toContain('0');
  });

  it('running_figure_unavailable empty read', () => {
    const container = card([]);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('Not measured');
    expect(container.textContent).not.toContain('0');
  });

  it('running_figure_unavailable row without state', () => {
    const container = card([{ key: 'omnimarket#1', state: 'running' }, { key: 'omnimarket#2' }]);
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('Not measured');
    expect(container.textContent).not.toContain('1');
  });
});
