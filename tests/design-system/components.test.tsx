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
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { DashboardTabs, DashboardToggle, EmptyState, Fact, FactList, readTab, writeTab } from '@/design-system/components';
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
