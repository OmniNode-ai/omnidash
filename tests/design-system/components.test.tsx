// @vitest-environment jsdom
/**
 * OMN-22168 AC4: the one component kit in src/design-system/components, one test per component. Written before each
 * component moves into the kit, so each case is red until the kit exports it. Failure modes, per component:
 *
 * Tabs (DashboardTabs, moved from src/components/dashboard)
 *   T1  the selected tab is not kept in the address under its own parameter, the first tab is written into the address,
 *       or an unknown value does not fall back to the first tab;
 *   T2  a panel other than the selected one is drawn;
 *   T3  the keyboard does not move and select (arrows, Home, End), or more than one tab is in the tab order;
 *   T4  selecting a tab drops another parameter of the address;
 *   T5  the toggle beside it is not a named radio group, or does not report the choice.
 *
 * Empty state (EmptyState, replacing about 40 hand-written <p className="local-dashboard-empty"> on the pages)
 *   E1  it is not announced (role status) by default, or its words are lost;
 *   E2  a cell that only says "Not measured" is announced although the page never announced it;
 *   E3  an extra class, data-* or aria-* attribute, or a block element (div) a page needs is dropped;
 *   E4  a page writes the empty state's class itself instead of using the kit (the duplicate scan, with a planted control).
 *
 * Fact list (FactList and Fact, replacing the hand-written <dl> of the local pages and Evidence)
 *   F1  a fact is not a term and value pair (dt and dd inside one row) in a description list;
 *   F2  a row's tone or unavailable mark (data-field-tone, data-field-unavailable) or another data-* is dropped;
 *   F3  the value's own class (mono, local-identity-value) or title (the served timestamp) is dropped;
 *   F4  a look does not give its list class, or a page's extra class or aria-label is dropped;
 *   F5  a page writes a fact list's class itself (the duplicate scan, with a planted control).
 *
 * Status chip (StatusChip, the run outcome pill) and badge (Badge: fixture, failed here, tried first, a run's chip, the
 * since-last-visit chips)
 *   S1  the chip loses its words or its served outcome (data-outcome), which its colour keys on;
 *   S2  a chip with no served outcome gets one anyway (an empty or guessed data-outcome);
 *   B1  a look does not give its class, or a tone (data-tone) or key is dropped;
 *   B2  a page writes a chip or badge class itself (the duplicate scan, with a planted control).
 *
 * Panel and card (Panel, PanelTitle: the article every page component and the Overview headline cards sit in) and figure
 * card (Figure: a card's headline figure)
 *   P1  the panel is not an article, loses its full-chart variant or a page's extra class, or drops data-* / aria-*;
 *   P2  a panel's title loses its class or its page-heading mark;
 *   G1  a figure loses its measured mark (data-measured, which keeps an unmeasured figure in the unavailable ink), title
 *       or style, or gets a measured mark the page never set;
 *   P3  a page writes a panel or figure class itself, including inside a template literal (the duplicate scan);
 *   K1  a KPI tile loses its tone, its label, value or notes, or marks a value unavailable that the page did not.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { Badge, DashboardTabs, DashboardToggle, EmptyState, Fact, FactList, Figure, KpiTile, Panel, PanelTitle, readTab, StatusChip, writeTab } from '@/design-system/components';
import { pageLocalCopies, scanAll, summarise } from './scan';

afterEach(cleanup);

const TABS = [
  { id: 'models', label: 'Models', panel: () => <p>models panel</p> },
  { id: 'tiers', label: 'Tiers', panel: () => <p>tiers panel</p> },
  { id: 'tasks', label: 'Tasks', panel: () => <p>tasks panel</p> },
];

function at(path: string) {
  const { hook, searchHook, history } = memoryLocation({ path, record: true });
  render(<Router hook={hook} searchHook={searchHook}><DashboardTabs label="Group by" param="by" tabs={TABS} /></Router>);
  return history;
}

describe('Tabs', () => {
  it('T1: the address keeps the selected tab; the first tab is the default and an unknown value falls back to it', () => {
    expect(readTab('?by=tiers', 'by', ['models', 'tiers'])).toBe('tiers');
    expect(readTab('?by=nope', 'by', ['models', 'tiers'])).toBe('models');
    expect(readTab('', 'by', ['models', 'tiers'])).toBe('models');
    expect(writeTab('by=tiers', 'by', ['models', 'tiers'], 'models')).toBe('');
    const history = at('/usage?by=nope');
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Tiers' }));
    expect(history.at(-1)).toBe('/usage?by=tiers');
  });

  it('T2: only the selected panel is drawn', () => {
    at('/usage?by=tasks');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('tasks panel');
    expect(screen.queryByText('models panel')).toBeNull();
    expect(screen.queryByText('tiers panel')).toBeNull();
  });

  it('T3: arrows, Home and End move and select; one tab is in the tab order', () => {
    at('/usage');
    const models = screen.getByRole('tab', { name: 'Models' });
    expect(screen.getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toEqual([models]);
    fireEvent.keyDown(models, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Tasks' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Models' }), { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1);
  });

  it('T4: selecting a tab keeps the address\'s other parameters', () => {
    const history = at('/usage?window=7&by=models');
    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }));
    expect(new URLSearchParams(history.at(-1)!.split('?')[1]).get('window')).toBe('7');
  });

  it('T5: the toggle is a radio group whose choice is reported', () => {
    let chosen = '';
    render(<DashboardToggle label="Series" value="runs" onChange={value => { chosen = value; }}
      options={[{ value: 'runs', label: 'Runs' }, { value: 'tokens', label: 'Tokens' }]} />);
    expect(screen.getByRole('radiogroup', { name: 'Series' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Tokens' }));
    expect(chosen).toBe('tokens');
  });
});

describe('Empty state', () => {
  it('E1: it is announced as a status with its words', () => {
    render(<EmptyState>No runs match this filter</EmptyState>);
    const state = screen.getByRole('status');
    expect(state).toHaveTextContent('No runs match this filter');
    expect(state.tagName).toBe('P');
    expect(state).toHaveClass('local-dashboard-empty');
  });

  it('E2: a quiet cell is not announced', () => {
    const { container } = render(<EmptyState status={false}>Not measured</EmptyState>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveClass('local-dashboard-empty');
  });

  it('E3: an extra class, data-* and aria-* attributes and a block element pass through', () => {
    const { container } = render(<EmptyState as="div" className="ins-empty" aria-label="Insights" data-usage-analysis="">x</EmptyState>);
    const state = container.firstElementChild!;
    expect(state.tagName).toBe('DIV');
    expect(state).toHaveClass('local-dashboard-empty', 'ins-empty');
    expect(state).toHaveAttribute('aria-label', 'Insights');
    expect(state).toHaveAttribute('data-usage-analysis', '');
  });

  it('E4: control: a page writing the empty-state class itself is caught', () => {
    expect(pageLocalCopies('src/pages/local/Planted.tsx', '<p className="local-dashboard-empty" role="status">x</p>')).toHaveLength(1);
    expect(pageLocalCopies('src/pages/local/Planted.tsx', "<p className={error ? 'local-dashboard-error' : 'local-dashboard-empty'}>x</p>")).toHaveLength(1);
    expect(pageLocalCopies('src/design-system/components/EmptyState.tsx', 'className="local-dashboard-empty"')).toEqual([]);
  });

  it('E4: no local page or Delegation Evidence writes a kit component\'s class itself', () => {
    const hits = scanAll(pageLocalCopies);
    expect(hits, summarise(hits)).toEqual([]);
  });
});

describe('Fact list', () => {
  it('F1: a fact is a term and value pair in one row of a description list', () => {
    const { container } = render(<FactList><Fact term="Tenant">acme</Fact></FactList>);
    const list = container.querySelector('dl')!;
    expect(list).toHaveClass('local-dashboard-fields');
    const row = list.firstElementChild!;
    expect(row.tagName).toBe('DIV');
    expect(row.querySelector('dt')).toHaveTextContent('Tenant');
    expect(row.querySelector('dd')).toHaveTextContent('acme');
  });

  it('F2: the row keeps its tone, its unavailable mark and other data-* attributes', () => {
    const { container } = render(<FactList><Fact term="All runs" data-field-tone="delegations" data-field-unavailable data-routing-count="total">4</Fact></FactList>);
    const row = container.querySelector('dl > div')!;
    expect(row).toHaveAttribute('data-field-tone', 'delegations');
    expect(row).toHaveAttribute('data-field-unavailable', 'true');
    expect(row).toHaveAttribute('data-routing-count', 'total');
  });

  it('F3: the value keeps its own class and title', () => {
    const { container } = render(<FactList><Fact term="Minted" valueClassName="mono" valueTitle="2026-10-25T10:36:18Z">Oct 25</Fact></FactList>);
    const value = container.querySelector('dd')!;
    expect(value).toHaveClass('mono');
    expect(value).toHaveAttribute('title', '2026-10-25T10:36:18Z');
  });

  it('F4: each look gives its list class; a page may add a class and a name', () => {
    const looks = { fields: 'local-dashboard-fields', provider: 'local-provider-facts', 'provider-inline': 'local-provider-facts local-provider-facts--inline',
      'routing-counts': 'local-routing-counts', 'provider-figures': 'local-provider-figures', 'evidence-derivation': 'ev-evidence-derivation' } as const;
    for (const [look, classes] of Object.entries(looks)) {
      const { container } = render(<FactList look={look as keyof typeof looks}><Fact term="a">b</Fact></FactList>);
      expect(container.querySelector('dl')!.className, look).toBe(classes);
      cleanup();
    }
    const { container } = render(<FactList className="local-latest-primary" aria-label="Claim derivation"><Fact term="a">b</Fact></FactList>);
    expect(container.querySelector('dl')).toHaveClass('local-dashboard-fields', 'local-latest-primary');
    expect(container.querySelector('dl')).toHaveAttribute('aria-label', 'Claim derivation');
  });

  it('F5: control: a page writing a fact list class itself is caught', () => {
    for (const cls of ['local-dashboard-fields', 'local-provider-facts', 'local-routing-counts', 'local-provider-figures', 'ev-evidence-derivation']) {
      expect(pageLocalCopies('src/pages/local/Planted.tsx', `<dl className="${cls}">`), cls).toHaveLength(1);
    }
  });
});

describe('Status chip and badge', () => {
  it('S1: the chip keeps its words and its served outcome', () => {
    const { container } = render(<StatusChip outcome="failed">failed</StatusChip>);
    const chip = container.firstElementChild!;
    expect(chip).toHaveClass('local-run-pill');
    expect(chip).toHaveAttribute('data-outcome', 'failed');
    expect(chip).toHaveTextContent('failed');
  });

  it('S2: a chip with no served outcome carries none', () => {
    const { container } = render(<StatusChip>Not recorded</StatusChip>);
    expect(container.firstElementChild).not.toHaveAttribute('data-outcome');
  });

  it('B1: each look gives its class and keeps a tone', () => {
    const looks = { default: 'local-dashboard-badge', provider: 'local-provider-badge', 'run-fact': 'local-run-chip', 'since-visit': 'local-since-visit-chip' } as const;
    for (const [look, cls] of Object.entries(looks)) {
      const { container } = render(<Badge look={look as keyof typeof looks}>x</Badge>);
      expect(container.firstElementChild!.className, look).toBe(cls);
      cleanup();
    }
    const { container } = render(<Badge look="since-visit" data-tone="failed">2 failed</Badge>);
    expect(container.firstElementChild).toHaveAttribute('data-tone', 'failed');
  });

  it('B2: control: a page writing a chip or badge class itself is caught', () => {
    for (const cls of ['local-run-pill', 'local-dashboard-badge', 'local-provider-badge', 'local-run-chip', 'local-since-visit-chip']) {
      expect(pageLocalCopies('src/pages/local/Planted.tsx', `<span className="${cls}">x</span>`), cls).toHaveLength(1);
    }
  });
});

describe('Panel, card and figure', () => {
  it('P1: the panel is an article with its variant, a page class and its marks', () => {
    const { container } = render(<Panel full className="local-run-routing" aria-label="Routing" aria-busy="false" data-component="usage-routing" data-kind="metric_card">x</Panel>);
    const panel = container.firstElementChild!;
    expect(panel.tagName).toBe('ARTICLE');
    expect(panel.className).toBe('local-dashboard-panel local-dashboard-panel--full-chart local-run-routing');
    expect(panel).toHaveAttribute('aria-label', 'Routing');
    expect(panel).toHaveAttribute('aria-busy', 'false');
    expect(panel).toHaveAttribute('data-component', 'usage-routing');
    expect(panel).toHaveAttribute('data-kind', 'metric_card');
    cleanup();
    expect(render(<Panel>y</Panel>).container.firstElementChild!.className).toBe('local-dashboard-panel');
  });

  it('P2: a panel title keeps its class and its page-heading mark', () => {
    const { container } = render(<PanelTitle data-page-heading tabIndex={-1}>Run charts</PanelTitle>);
    const title = container.firstElementChild!;
    expect(title.tagName).toBe('H2');
    expect(title).toHaveClass('local-dashboard-panel-title');
    expect(title).toHaveAttribute('data-page-heading');
    expect(title).toHaveAttribute('tabindex', '-1');
  });

  it('G1: a figure keeps its measured mark, title and style, and gets none it was not given', () => {
    const { container } = render(<Figure measured={false}>Not measured</Figure>);
    expect(container.firstElementChild).toHaveClass('local-dashboard-metric');
    expect(container.firstElementChild).toHaveAttribute('data-measured', 'false');
    cleanup();
    const second = render(<Figure measured title="1234" style={{ color: 'red' }}>1.2k</Figure>).container.firstElementChild!;
    expect(second).toHaveAttribute('data-measured', 'true');
    expect(second).toHaveAttribute('title', '1234');
    expect(second).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    cleanup();
    expect(render(<Figure>3</Figure>).container.firstElementChild).not.toHaveAttribute('data-measured');
  });

  it('P3: control: a page writing a panel or figure class itself is caught, in a template literal too', () => {
    for (const code of ['<article className="local-dashboard-panel">', '<h2 className="local-dashboard-panel-title">', '<p className="local-dashboard-metric">',
      "<article className={`local-dashboard-panel${full ? ' local-dashboard-panel--full-chart' : ''}`}>"]) {
      expect(pageLocalCopies('src/pages/local/Planted.tsx', code).length, code).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('KPI tile', () => {
  it('K1: a tile keeps its tone, label, value and notes, and its unavailable mark only when given', () => {
    const { container } = render(<KpiTile tone="cost" label="You paid" value="Unavailable" unavailable><small>note</small><small>delta</small></KpiTile>);
    const tile = container.firstElementChild!;
    expect(tile.tagName).toBe('DIV');
    expect(tile.className).toBe('ins-kpi local-dashboard-metric');
    expect(tile).toHaveAttribute('data-field-tone', 'cost');
    expect(tile.querySelector('span')).toHaveTextContent('You paid');
    expect(tile.querySelector('strong')).toHaveTextContent('Unavailable');
    expect(tile.querySelector('strong')).toHaveAttribute('data-field-unavailable', 'true');
    expect(tile.querySelectorAll('small')).toHaveLength(2);
    cleanup();
    const plain = render(<KpiTile tone="count" label="Runs" value="4" />).container;
    expect(plain.querySelector('strong')).not.toHaveAttribute('data-field-unavailable');
    expect(pageLocalCopies('src/pages/local/Planted.tsx', '<div className="ins-kpi">')).toHaveLength(1);
  });
});
