/**
 * OMN-21970 AC9 (Lakshman 2026-11-02, "1"): Overview's figures window is one button that opens a short list, the chosen
 * range ticked, instead of a row of five buttons. The ranges and what each one does are unchanged (All, Today, the last
 * 7, 15 or 30 UTC days); each option keeps radio semantics and its full name ("Today (UTC)") for assistive tech. Choosing
 * an option closes the list, as do Escape and a click outside it; focus returns to the button.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarClock, CalendarDays, CalendarFold, CalendarRange, Check, ChevronDown, Infinity as InfinityIcon, Sun, type LucideIcon } from '@/theme/design-system/icons';

/** OMN-22168 (Lakshman 2026-11-04, "use icons ... colourful"): each window's glyph; its colour is the window's tone. */
const WINDOW_ICONS: Readonly<Record<string, LucideIcon>> = {
  all: InfinityIcon, today: Sun, 'last-7': CalendarRange, 'last-15': CalendarClock, 'last-30': CalendarDays, 'last-90': CalendarFold,
};
function WindowIcon({ value }: { value: string | undefined }) {
  const Icon = value ? WINDOW_ICONS[value] : undefined;
  // Each window is its own concept (one icon, one tone), named for the identity census.
  return Icon ? <Icon className="local-window-icon" size={16} aria-hidden="true" data-semantic-concept={`window:${value}`} /> : null;
}

export interface WindowMenuOption { value: string; label: string; name: string; checked: boolean; onSelect: () => void }

/**
 * OMN-23330 AC36 (operator, chat 2026-11-11, from a benchmark of 20 open-source dashboards): one key per window. A key
 * never acts while the reader types in a field, or with Ctrl, Cmd or Alt held (those are the browser's own shortcuts).
 */
const WINDOW_KEYS: readonly (readonly [key: string, value: string, name: string])[] = [
  ['A', 'all', 'All time'], ['T', 'today', 'Today'], ['W', 'last-7', 'Last 7 days'],
  ['F', 'last-15', 'Last 15 days'], ['M', 'last-30', 'Last 30 days'], ['Q', 'last-90', 'Last 90 days'],
];
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.getAttribute('contenteditable') === 'true' || target.getAttribute('contenteditable') === ''
    || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function WindowMenu({ labelledBy, options, current }: { labelledBy: string; options: readonly WindowMenuOption[]; current: string }) {
  const [open, setOpen] = useState(false);
  const [keysShown, setKeysShown] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingIn(event.target)) return;
      if (event.key === 'Escape') { setKeysShown(false); return; }
      if (event.key === '?') { setKeysShown(value => !value); event.preventDefault(); return; }
      const entry = WINDOW_KEYS.find(([key]) => key === event.key.toUpperCase());
      const option = entry ? latest.current.find(candidate => candidate.value === entry[1]) : undefined;
      if (option) { option.onSelect(); setOpen(false); event.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  return <div className="local-window-menu" ref={root}>
    {/* OMN-22168 (Lakshman 2026-11-04, "make colourful"): the trigger names the chosen window's tone (its dot). */}
    <button ref={trigger} type="button" className="local-window-trigger" aria-haspopup="true" aria-expanded={open} aria-controls={open ? listId : undefined}
      data-window={options.find(option => option.checked)?.value}
      aria-labelledby={`${labelledBy} ${listId}-current`} onClick={() => setOpen(value => !value)}>
      <WindowIcon value={options.find(option => option.checked)?.value} /><span id={`${listId}-current`}>{current}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={listId} role="radiogroup" aria-labelledby={labelledBy} className="local-window-list local-window-radios">
      {options.map(option => (
        <button key={option.value} type="button" role="radio" data-window={option.value} aria-checked={option.checked} aria-label={option.name}
          onClick={() => { option.onSelect(); setOpen(false); trigger.current?.focus(); }}>
          <WindowIcon value={option.value} /><span>{option.label}</span>
          {option.checked && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>}
    {/* AC36: "?" lists the keys; Escape or "?" again closes the list. */}
    {keysShown && <div role="dialog" aria-label="Keyboard shortcuts" className="local-window-keys">
      <dl>{WINDOW_KEYS.map(([key, , name]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{name}</dd></div>)}
        <div><dt><kbd>?</kbd></dt><dd>Show or hide this list</dd></div></dl>
    </div>}
  </div>;
}
