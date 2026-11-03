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
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { DashboardTabs, DashboardToggle, EmptyState, readTab, writeTab } from '@/design-system/components';
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
