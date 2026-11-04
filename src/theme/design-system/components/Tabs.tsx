import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';

/**
 * OMN-21166 part 30 (revision 7) AC201: the dashboard's one tab component and one toggle. A tabbed panel keeps its
 * selected tab in the address under its own parameter, so a reload or a shared link opens the same tab; the first tab
 * is the default and is left out of the address, and an unknown value falls back to it. The tab list follows the ARIA
 * tabs pattern (arrow keys, Home and End move and select, one tab in the tab order) and only the selected panel is drawn.
 * Both controls sit in the shared filter part, so their text is drawn where every panel's controls are (OMN-21015 K2).
 */
export interface DashboardTab { id: string; label: string; panel: () => ReactNode }

/** The tab a search string selects for one panel: its parameter when it names a tab, else the first tab. */
export function readTab(search: string, param: string, ids: readonly string[]): string {
  const value = new URLSearchParams(search).get(param);
  return value !== null && ids.includes(value) ? value : ids[0]!;
}

/** The search string with one panel's tab set; the first tab removes the parameter, other parameters are kept. */
export function writeTab(search: string, param: string, ids: readonly string[], id: string): string {
  const params = new URLSearchParams(search);
  if (id === ids[0]) params.delete(param);
  else params.set(param, id);
  return params.toString();
}

const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

export function DashboardTabs({ label, param, tabs }: { label: string; param: string; tabs: readonly DashboardTab[] }) {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const base = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const ids = tabs.map(tab => tab.id);
  const active = readTab(search, param, ids);
  const select = (id: string) => {
    const query = writeTab(search, param, ids, id);
    navigate(`${location}${query ? `?${query}` : ''}`, { replace: true });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const move = MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    const next = move(index, tabs.length);
    select(ids[next]!);
    buttons.current[next]?.focus();
  };
  const panel = tabs.find(tab => tab.id === active)!;
  return <div className="local-dashboard-tabs" data-tabs={param}>
    <div className="local-dashboard-filters local-dashboard-tablist" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button key={tab.id} ref={element => { buttons.current[index] = element; }} type="button" role="tab"
        id={`${base}-${tab.id}-tab`} aria-controls={`${base}-${tab.id}-panel`} aria-selected={tab.id === active}
        tabIndex={tab.id === active ? 0 : -1} data-tab={tab.id} onClick={() => select(tab.id)} onKeyDown={event => onKeyDown(event, index)}>
        {tab.label}
      </button>)}
    </div>
    <div role="tabpanel" id={`${base}-${panel.id}-panel`} aria-labelledby={`${base}-${panel.id}-tab`} tabIndex={0}
      className="local-dashboard-tabpanel" data-tab-panel={panel.id}>
      {panel.panel()}
    </div>
  </div>;
}

export interface ToggleOption<T extends string> { value: T; label: string }

/** A small choice that changes what a panel shows (a radio group in the shared filter part). */
export function DashboardToggle<T extends string>({ label, options, value, onChange }: {
  label: string; options: ReadonlyArray<ToggleOption<T>>; value: T; onChange: (value: T) => void;
}) {
  const name = useId();
  return <div className="local-dashboard-filters local-dashboard-toggle" role="radiogroup" aria-label={label}>
    {options.map(option => <label key={option.value}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      {option.label}
    </label>)}
  </div>;
}
