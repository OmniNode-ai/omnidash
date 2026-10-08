import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { AlertBanner } from './AlertBanner';
import { SEVERITY_ROLES } from '../status-grid/severity';
import { SEED_ALERT_ROWS, SEED_ALERTS_TOPIC } from '../status-grid/seed-rows';

// OMN-19993: the open-alerts banner (OV-6). One banner per open critical alert, one collapsed line for
// the rest, each with code, subject and since-when; dismissing hides for the session and does not clear.
describe('AlertBanner', () => {
  const critical = SEED_ALERT_ROWS.filter((a) => a.severity === 'critical');
  const rest = SEED_ALERT_ROWS.filter((a) => a.severity !== 'critical');

  it('the seed has at least one critical and one non-critical alert', () => {
    expect(critical.length).toBeGreaterThan(0);
    expect(rest.length).toBeGreaterThan(0);
  });

  it('renders one banner per critical alert with edge, word, code, subject and since', () => {
    render(<AlertBanner alerts={SEED_ALERT_ROWS} waitsOn={[SEED_ALERTS_TOPIC]} />);
    const banners = screen.getAllByTestId('alert-banner-critical');
    expect(banners).toHaveLength(critical.length);
    for (const [i, alert] of critical.entries()) {
      const b = banners[i]!;
      expect(within(b).getByText(SEVERITY_ROLES.critical.label)).toBeTruthy();
      expect(within(b).getByText(alert.code)).toBeTruthy();
      expect(within(b).getByText(alert.subject)).toBeTruthy();
      expect(within(b).getByText(`since ${alert.since}`)).toBeTruthy();
      expect(b.style.borderLeft).toBe(`4px solid ${SEVERITY_ROLES.critical.edge}`);
    }
  });

  it('collapses the non-critical alerts into one line that expands', () => {
    render(<AlertBanner alerts={SEED_ALERT_ROWS} waitsOn={[SEED_ALERTS_TOPIC]} />);
    const line = screen.getByTestId('alert-banner-collapsed');
    expect(line.textContent).toContain(`${rest.length} more open alert${rest.length === 1 ? '' : 's'}`);
    expect(screen.queryByText(rest[0]!.code)).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: /show/i }));
    for (const a of rest) expect(screen.getByText(a.code)).toBeTruthy();
  });

  it('dismissing hides the banner for this mount only; a remount (reload) shows it again', () => {
    const first = render(<AlertBanner alerts={SEED_ALERT_ROWS} waitsOn={[SEED_ALERTS_TOPIC]} />);
    const banner = screen.getAllByTestId('alert-banner-critical')[0]!;
    fireEvent.click(within(banner).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryAllByTestId('alert-banner-critical')).toHaveLength(critical.length - 1);
    first.unmount();
    render(<AlertBanner alerts={SEED_ALERT_ROWS} waitsOn={[SEED_ALERTS_TOPIC]} />);
    expect(screen.getAllByTestId('alert-banner-critical')).toHaveLength(critical.length);
  });

  it('says "All clear" and names the topic it reads when no alert is open', () => {
    render(<AlertBanner alerts={[]} waitsOn={[SEED_ALERTS_TOPIC]} />);
    expect(screen.getByTestId('alert-banner-clear').textContent).toBe(
      `All clear: no open alerts on ${SEED_ALERTS_TOPIC}`,
    );
  });

  it('refuses an alert missing its code rather than drawing a nameless banner', () => {
    const broken = { ...critical[0]!, alert_id: 'broken', code: '' };
    render(<AlertBanner alerts={[...SEED_ALERT_ROWS, broken]} waitsOn={[SEED_ALERTS_TOPIC]} />);
    expect(screen.getAllByTestId('alert-banner-critical')).toHaveLength(critical.length);
    expect(screen.getByTestId('alert-banner-refused').textContent).toMatch(/1 alert refused: broken: code is required/);
  });

  it('never says "All clear" when every row it was given was refused', () => {
    const broken = { ...critical[0]!, alert_id: 'broken', code: '' };
    render(<AlertBanner alerts={[broken]} waitsOn={[SEED_ALERTS_TOPIC]} />);
    expect(screen.queryByTestId('alert-banner-clear')).toBeNull();
    expect(screen.queryByText(/All clear/)).toBeNull();
    expect(screen.getByTestId('alert-banner-refused').textContent).toMatch(/1 alert refused: broken: code is required/);
  });

  it('links an alert to where to look next when it carries a link', () => {
    render(<AlertBanner alerts={SEED_ALERT_ROWS} waitsOn={[SEED_ALERTS_TOPIC]} />);
    const withLink = critical.find((a) => a.link);
    expect(withLink).toBeDefined();
    const link = screen.getAllByRole('link', { name: /open/i })[0]!;
    expect(link.getAttribute('href')).toBe(withLink!.link);
  });
});
