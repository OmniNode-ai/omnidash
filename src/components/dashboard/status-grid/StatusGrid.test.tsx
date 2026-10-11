import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StatusGrid } from './StatusGrid';
import { SEVERITY_ROLES } from './severity';
import { SEED_ENVIRONMENT_ROWS, SEED_ENVIRONMENT_TOPIC } from './seed-rows';
import { STATUS_GRID_SEVERITIES, type StatusGridRow } from '@shared/types/component-manifest';

// OMN-19993: the Services status grid (OV-2). Status is a colored edge plus a word, never color alone,
// every row says why it is in its state, and the empty state names the topic it waits on.
describe('StatusGrid', () => {
  it('renders one tile per row with the upstream word, the severity label and the reason', () => {
    render(<StatusGrid title="Services" rows={SEED_ENVIRONMENT_ROWS} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />);
    const tiles = screen.getAllByTestId('status-grid-tile');
    expect(tiles).toHaveLength(SEED_ENVIRONMENT_ROWS.length);
    for (const [i, row] of SEED_ENVIRONMENT_ROWS.entries()) {
      const tile = tiles[i]!;
      expect(within(tile).getByText(row.status)).toBeTruthy();
      expect(within(tile).getByText(row.status_reason)).toBeTruthy();
      expect(within(tile).getByText(SEVERITY_ROLES[row.severity].label)).toBeTruthy();
      expect(tile.getAttribute('data-severity')).toBe(row.severity);
    }
  });

  it('draws each status as a colored left edge from the severity token', () => {
    render(<StatusGrid title="Services" rows={SEED_ENVIRONMENT_ROWS} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />);
    for (const tile of screen.getAllByTestId('status-grid-tile')) {
      const severity = tile.getAttribute('data-severity') as StatusGridRow['severity'];
      expect(tile.style.borderLeft).toBe(`4px solid ${SEVERITY_ROLES[severity].edge}`);
    }
  });

  it('gives every severity a distinct word and a distinct icon, so grayscale still tells them apart', () => {
    const labels = STATUS_GRID_SEVERITIES.map((s) => SEVERITY_ROLES[s].label);
    const icons = STATUS_GRID_SEVERITIES.map((s) => SEVERITY_ROLES[s].iconName);
    expect(new Set(labels).size).toBe(STATUS_GRID_SEVERITIES.length);
    expect(new Set(icons).size).toBe(STATUS_GRID_SEVERITIES.length);
  });

  it('refuses a row with no reason instead of drawing it, and says how many were refused', () => {
    const noReason = { ...SEED_ENVIRONMENT_ROWS[0]!, key: 'ghost', label: 'ghost', status_reason: '' };
    render(
      <StatusGrid title="Services" rows={[...SEED_ENVIRONMENT_ROWS, noReason]} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />,
    );
    expect(screen.getAllByTestId('status-grid-tile')).toHaveLength(SEED_ENVIRONMENT_ROWS.length);
    expect(screen.queryByText('ghost')).toBeNull();
    expect(screen.getByTestId('status-grid-refused').textContent).toMatch(/1 row refused: ghost: status_reason is required/);
  });

  it('summarises the counts per severity in a footer', () => {
    render(<StatusGrid title="Services" rows={SEED_ENVIRONMENT_ROWS} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />);
    const counts = new Map<string, number>();
    for (const r of SEED_ENVIRONMENT_ROWS) counts.set(r.severity, (counts.get(r.severity) ?? 0) + 1);
    const footer = screen.getByTestId('status-grid-summary').textContent ?? '';
    for (const [severity, n] of counts) {
      expect(footer).toContain(`${n} ${SEVERITY_ROLES[severity as StatusGridRow['severity']].label.toLowerCase()}`);
    }
  });

  it('names the topic it waits on when there are no rows', () => {
    render(<StatusGrid title="Services" rows={[]} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />);
    expect(screen.getByText(`Waiting for ${SEED_ENVIRONMENT_TOPIC} events`)).toBeTruthy();
    expect(screen.queryAllByTestId('status-grid-tile')).toHaveLength(0);
  });

  it('shows last-seen, and says "never seen" rather than a blank when it is missing', () => {
    const rows: StatusGridRow[] = [
      { key: 'a', label: 'a', status: 'RUNNING', severity: 'nominal', status_reason: 'healthy', last_seen: '2026-10-07T11:00:00Z' },
      { key: 'b', label: 'b', status: 'UNKNOWN', severity: 'unknown', status_reason: 'no observation yet', last_seen: null },
    ];
    render(<StatusGrid title="Services" rows={rows} waitsOn={[SEED_ENVIRONMENT_TOPIC]} />);
    const [a, b] = screen.getAllByTestId('status-grid-tile');
    expect(within(a!).getByText(/last seen 2026-10-07T11:00:00Z/)).toBeTruthy();
    expect(within(b!).getByText('never seen')).toBeTruthy();
  });

  it('every seed row is itself valid, and the seed covers every severity', () => {
    expect(new Set(SEED_ENVIRONMENT_ROWS.map((r) => r.severity))).toEqual(new Set(STATUS_GRID_SEVERITIES));
  });
});
