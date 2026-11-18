// @vitest-environment jsdom
// OMN-25104 AC3: the Overview Done figure is the count of served done-items.v1 rows, never 0 for an unread or empty store.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServedCountCard, doneItemsCount } from './served-count-card';

afterEach(cleanup);

describe('ServedCountCard', () => {
  it('done_figure_from_served_projection three rows show 3', () => {
    const rows = [
      { ticket: 'T1' },
      { ticket: 'T2' },
      { ticket: 'T3' },
    ];
    const { container } = render(
      <ServedCountCard label="Done" rows={rows} failure={null} count={doneItemsCount(rows)} />
    );
    const figure = container.querySelector('.local-dashboard-metric');
    expect(figure?.textContent).toBe('3');
  });

  it('done_figure_from_served_projection failure projection_table_missing shows Not measured with reason in caption, never 0', () => {
    const rows = [
      { ticket: 'T1' },
      { ticket: 'T2' },
    ];
    const failure = { reason: 'projection_table_missing' };
    const { container } = render(
      <ServedCountCard label="Done" rows={rows} failure={failure} count={doneItemsCount(rows)} />
    );
    const figure = container.querySelector('.local-dashboard-metric');
    expect(figure?.textContent).toBe('Not measured');
    const caption = container.querySelector('.local-dashboard-caption');
    expect(caption?.textContent).toContain('projection_table_missing');
    expect(figure?.textContent).not.toBe('0');
  });

  it('done_figure_from_served_projection no rows shows Not measured with caption that no done items were served, never 0', () => {
    const rows: Record<string, unknown>[] = [];
    const { container } = render(
      <ServedCountCard label="Done" rows={rows} failure={null} count={doneItemsCount(rows)}
        emptyCaption="The read returned no rows: no done items were served." />
    );
    const figure = container.querySelector('.local-dashboard-metric');
    expect(figure?.textContent).toBe('Not measured');
    const caption = container.querySelector('.local-dashboard-caption');
    expect(caption?.textContent).toContain('no done items were served');
    expect(figure?.textContent).not.toBe('0');
  });

  it('done_figure_from_served_projection a row without ticket shows Not measured', () => {
    const rows = [
      { ticket: '' },
    ];
    const { container } = render(
      <ServedCountCard label="Done" rows={rows} failure={null} count={doneItemsCount(rows)} />
    );
    const figure = container.querySelector('.local-dashboard-metric');
    expect(figure?.textContent).toBe('Not measured');
  });
});
