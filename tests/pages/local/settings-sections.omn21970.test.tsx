// @vitest-environment jsdom
// OMN-21970 AC10 (Lakshman 2026-11-02): Settings adds a Pricing and routing section, the store location and state time
// in System status, and a menu linking the sections. Failure modes, declared before the code, each with a test:
//   S1  Pricing shows a day row's baseline instead of the all-time row's, or invents a model or version;
//   S2  a pricing field the row leaves empty renders anyway, or no row at all shows a blank section;
//   S3  System status leaves out the served store location or state time, or shows a label when they are not served;
//   S4  the menu misses a section, or links to an id no section has.
import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PricingFacts } from '@/pages/local/pricing';
import { EnvironmentPanel } from '@/pages/local/environment';
import { SettingsPage, sectionFromHash } from '@/pages/SettingsPage';

// The embedded pages are their own tested documents; here only which page each section embeds matters.
vi.mock('@/pages/LocalDashboardPage', () => ({ LocalDashboardPage: ({ pageName }: { pageName: string }) => <div data-testid="embedded-page">{pageName}</div> }));

const ALL = { window_kind: 'all', window_start: '', baseline_model: 'claude-sonnet-5-5', pricing_manifest_version: '1.0.0',
  baseline_state: 'resolved', as_of: '2026-11-02T11:31:52.906307+00:00' };
const DAY = { ...ALL, window_kind: 'day', window_start: '2026-11-02', baseline_model: 'day-model', pricing_manifest_version: '0.9.0' };

describe('OMN-21970 AC10: Pricing and routing', () => {
  it('S1: names the all-time row\'s baseline model and pricing version, not a day row\'s', () => {
    render(<PricingFacts rows={[DAY, ALL]} />);
    expect(screen.getByText('claude-sonnet-5-5')).toBeTruthy();
    expect(screen.getByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('Nov 2, 11:31:52 UTC')).toBeTruthy();
    expect(screen.queryByText('day-model')).toBeNull();
  });

  it('S2: an empty field is left out, and no row says pricing is not recorded yet', () => {
    const { unmount } = render(<PricingFacts rows={[{ ...ALL, pricing_manifest_version: null, as_of: '' }]} />);
    expect(screen.queryByText('Pricing version')).toBeNull();
    expect(screen.queryByText('As of')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bnull\b|undefined/);
    unmount();
    render(<PricingFacts rows={[]} />);
    expect(screen.getByRole('status').textContent).toMatch(/No pricing recorded yet/);
  });
});

const ENV = { tenant_id: 't', mode: 'native', service: 'local-runtime', observed_state: 'running', verdict: 'running',
  verdict_reason: 'serving', versions: { omnimarket: '0.4.321' }, store_kind: 'sqlite', token_minted_at: '2026-11-02T11:33:51Z',
  last_seen: '2026-11-02T15:05:02Z', alert_code: null, alert_severity: null, alert_since: null };

describe('OMN-21970 AC10: System status store location and state time', () => {
  it('S3: shows the served store location and state time, and neither label when not served', () => {
    const { unmount } = render(<EnvironmentPanel rows={[{ ...ENV, store_location: '/home/u/.omninode/delegation/delegation.sqlite', last_change: '2026-10-25T10:17:41Z' }]} />);
    expect(screen.getByText('/home/u/.omninode/delegation/delegation.sqlite')).toBeTruthy();
    expect(within(screen.getByText('State since').parentElement as HTMLElement).getByText('Oct 25, 10:17:41 UTC')).toBeTruthy();
    unmount();
    render(<EnvironmentPanel rows={[{ ...ENV, store_location: null, last_change: null }]} />);
    expect(screen.queryByText('Store location')).toBeNull();
    expect(screen.queryByText('State since')).toBeNull();
  });
});

// S4  the menu misses a section or links to none; a section other than the chosen one shows; an unknown hash shows nothing.
describe('OMN-21970 AC10: the Settings menu down the left', () => {
  // A link reads its number (aria-hidden) then its title; the title is what names the section.
  const title = (link: HTMLElement) => (link.textContent ?? '').replace(/^\d{2}/, '');
  const visible = () => [...document.querySelectorAll('main section.local-settings-section')]
    .filter(section => !(section as HTMLElement).hidden).map(section => section.querySelector('h2')?.textContent);

  it('S4: lists the four sections in order and shows Model providers when no section is chosen', () => {
    window.location.hash = '';
    render(<SettingsPage navigationCache={{} as never} />);
    const links = within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole('link');
    expect(links.map(title)).toEqual(['Model providers', 'Access', 'Pricing and routing', 'System status']);
    expect(links.map(link => link.querySelector('.local-settings-index')?.textContent)).toEqual(['01', '02', '03', '04']);
    expect(links.map(link => link.getAttribute('href'))).toEqual(['#providers', '#access', '#pricing', '#system']);
    expect(visible()).toEqual(['Model providers']);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByTestId('embedded-page').map(el => el.textContent)).toEqual(['credentials', 'api-keys', 'pricing', 'status']);
  });

  it('S4: each hash shows only its own section and marks its link, and an unknown hash falls back to Model providers', async () => {
    window.location.hash = '#pricing';
    render(<SettingsPage navigationCache={{} as never} />);
    expect(visible()).toEqual(['Pricing and routing']);
    for (const [hash, heading] of [['#access', 'Access'], ['#system', 'System status'], ['#nonsense', 'Model providers']] as const) {
      await act(async () => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); });
      expect(visible()).toEqual([heading]);
      const current = within(screen.getByRole('navigation', { name: 'Settings sections' })).getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
      expect(current.map(link => title(link))).toEqual([heading]);
    }
    expect(sectionFromHash('')).toBe('providers');
  });
});
