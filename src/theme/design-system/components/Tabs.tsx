import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';

/**
 * OMN-21166 part 30 (revision 7) AC201: the dashboard's one tab component and one toggle. A tabbed panel keeps its
 * selected tab in the address under its own parameter, so a reload or a shared link opens the same tab; the first tab
 * is the default and is left out of the address, and an unknown value falls back to it. The tab list follows the ARIA
 * tabs pattern (arrow keys, Home and End move and select, one tab in the tab order) and only the selected panel is drawn.
 * Both controls sit in the shared filter part, so their text is drawn where every panel's controls are (OMN-21015 K2).
 */
export interface DashboardTab {
  id: string; label: string; panel: () => ReactNode;
  /** OMN-22168 (Lakshman 2026-11-04, "each tab colourful modern"): the tab's glyph, from the icon registry, and its tone. */
  icon?: ReactNode; tone?: string;
  /** OMN-22168 (Lakshman 2026-11-04, "best design, impress user"): a headline under the label (a stat tab). The tab keeps
   * its label as its accessible name. */
  hint?: ReactNode;
}

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
  // OMN-22168 (Lakshman 2026-11-04, "use slider to change tab"): one pill behind the tabs slides to the chosen tab; it is
  // decoration (aria-hidden), measured from the chosen button so it follows wrapping and resizing.
  const [slider, setSlider] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const activeIndex = ids.indexOf(active);
  useLayoutEffect(() => {
    const measure = () => {
      const button = buttons.current[activeIndex];
      setSlider(button ? { left: button.offsetLeft, top: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight } : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    const list = buttons.current[0]?.parentElement;
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [activeIndex]);
  return <div className="local-dashboard-tabs" data-tabs={param}>
    <div className="local-dashboard-filters local-dashboard-tablist" role="tablist" aria-label={label}>
      {slider && <span className="local-dashboard-tab-slider" aria-hidden="true" data-tab-slider={active}
        style={{ transform: `translate(${slider.left}px, ${slider.top}px)`, width: slider.width, height: slider.height }} />}
      {tabs.map((tab, index) => <button key={tab.id} ref={element => { buttons.current[index] = element; }} type="button" role="tab"
        id={`${base}-${tab.id}-tab`} aria-controls={`${base}-${tab.id}-panel`} aria-selected={tab.id === active}
        tabIndex={tab.id === active ? 0 : -1} data-tab={tab.id} onClick={() => select(tab.id)} onKeyDown={event => onKeyDown(event, index)}
        data-toned={tab.tone ? '' : undefined} data-stat={tab.hint !== undefined ? '' : undefined}
        aria-label={tab.hint !== undefined ? tab.label : undefined}
        style={tab.tone ? { '--tab-tone': tab.tone } as CSSProperties : undefined}>
        {tab.hint !== undefined
          ? <>{tab.icon && <span className="local-tab-chip" aria-hidden="true">{tab.icon}</span>}
            <span className="local-tab-text"><span className="local-tab-label">{tab.label}</span><span className="local-tab-hint">{tab.hint}</span></span></>
          : <>{tab.icon}{tab.label}</>}
      </button>)}
    </div>
    <div role="tabpanel" id={`${base}-${panel.id}-panel`} aria-labelledby={`${base}-${panel.id}-tab`} tabIndex={0}
      className="local-dashboard-tabpanel" data-tab-panel={panel.id}>
      {panel.panel()}
    </div>
  </div>;
}

export interface ToggleOption<T extends string> {
  value: T; label: string;
  /** The option's own colour (a field token), as each stat tab has one: its icon wears it and the thumb takes it. */
  tone?: string;
  /** The option's glyph, drawn before its label in its tone. */
  icon?: ReactNode;
}

/** A small choice that changes what a panel shows (a radio group in the shared filter part). */
export function DashboardToggle<T extends string>({ label, options, value, onChange }: {
  label: string; options: ReadonlyArray<ToggleOption<T>>; value: T; onChange: (value: T) => void;
}) {
  const name = useId();
  // OMN-22168 (Lakshman 2026-11-05, "all tab modern and same as overview or runs"): a pill track whose thumb slides to
  // the chosen option, as the Tokens in / Tokens out switch and the stat tabs' slider do; the thumb is decoration
  // (aria-hidden), measured from the chosen option so it follows wrapping and resizing.
  const labels = useRef<Array<HTMLLabelElement | null>>([]);
  const chosen = options.findIndex(option => option.value === value);
  const [thumb, setThumb] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const option = labels.current[chosen];
      setThumb(option ? { left: option.offsetLeft, top: option.offsetTop, width: option.offsetWidth, height: option.offsetHeight } : null);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    const group = labels.current[0]?.parentElement;
    if (group) observer.observe(group);
    return () => observer.disconnect();
  }, [chosen, options.length]);
  const tone = options[chosen]?.tone;
  return <div className="local-dashboard-filters local-dashboard-toggle" role="radiogroup" aria-label={label}
    style={tone ? { '--toggle-tone': tone } as CSSProperties : undefined}>
    {thumb && <span className="local-toggle-thumb" aria-hidden="true"
      style={{ transform: `translate(${thumb.left}px, ${thumb.top}px)`, width: thumb.width, height: thumb.height }} />}
    {options.map((option, index) => <label key={option.value} ref={element => { labels.current[index] = element; }}
      style={option.tone ? { '--option-tone': option.tone } as CSSProperties : undefined} data-toned={option.tone ? '' : undefined}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      {/* The glyph's badge is decoration (its colour names nothing on its own); ins-chip-icon lets the icon census read
          the option's own text as the glyph's label. */}
      {option.icon && <span className="local-toggle-icon ins-chip-icon" aria-hidden="true" data-identity-decoration="toggle-chip">{option.icon}</span>}
      {option.label}
    </label>)}
  </div>;
}
