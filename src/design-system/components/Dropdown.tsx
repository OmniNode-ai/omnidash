/**
 * OMN-22168 AC4: the one dropdown of the local pages, in the look of Overview's window menu (Lakshman 2026-11-03, "do like
 * overview?"): a button that names its label and the chosen option, opening a ticked list. It replaces the native
 * <select>, whose open list the operating system draws. Keyboard: ArrowDown, ArrowUp, Enter or Space open it from the
 * button; in the list ArrowUp/ArrowDown, Home/End and a typed letter move, Enter or Space choose, Escape leaves. Choosing
 * closes the list and returns focus to the button; Escape and a click outside close it without a change.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from '@/design-system/icons';
import './dropdown.css';

export interface DropdownOption { value: string; label: string; /** The full name for assistive tech, when the label is short. */ name?: string }

export function Dropdown({ label, value, options, onChange, id }: {
  label: string; value: string; options: readonly DropdownOption[]; onChange: (value: string) => void; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = Math.max(0, options.findIndex(option => option.value === value));
  const [active, setActive] = useState(chosen);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const own = useId();
  const base = id ?? own;

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const outside = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  useEffect(() => { if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
  // Opened near the right edge, the list aligns to the trigger's right edge instead, so the page's clipping never cuts it.
  const [alignEnd, setAlignEnd] = useState(false);
  useEffect(() => {
    if (!open || !list.current) { setAlignEnd(false); return; }
    const clip = list.current.closest('main') ?? document.documentElement;
    setAlignEnd(list.current.getBoundingClientRect().right > clip.getBoundingClientRect().right);
  }, [open]);

  const show = () => { setActive(chosen); setOpen(true); };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (index: number) => { const option = options[index]; close(); if (option && option.value !== value) onChange(option.value); };

  const onTriggerKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
  };
  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown': setActive(index => Math.min(last, index + 1)); break;
      case 'ArrowUp': setActive(index => Math.max(0, index - 1)); break;
      case 'Home': setActive(0); break;
      case 'End': setActive(last); break;
      case 'Enter': case ' ': choose(active); break;
      case 'Escape': close(); break;
      case 'Tab': setOpen(false); return;
      default: {
        if (event.key.length !== 1) return;
        const letter = event.key.toLowerCase();
        const order = [...options.keys()].map(step => (active + 1 + step) % options.length);
        const next = order.find(index => options[index]!.label.toLowerCase().startsWith(letter));
        if (next === undefined) return;
        setActive(next);
      }
    }
    event.preventDefault();
  };

  const current = options[chosen];
  return (
    <div className="ds-dropdown" ref={root}>
      <button ref={trigger} id={base} type="button" className="ds-dropdown-trigger" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? `${base}-list` : undefined} aria-label={`${label}: ${current?.name ?? current?.label ?? ''}`}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={onTriggerKey}>
        <span className="ds-dropdown-value">{current?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul ref={list} id={`${base}-list`} role="listbox" aria-label={label} tabIndex={-1} className="ds-dropdown-list" data-align={alignEnd ? 'end' : undefined}
          aria-activedescendant={`${base}-option-${active}`} onKeyDown={onListKey}>
          {options.map((option, index) => (
            <li key={option.value} id={`${base}-option-${index}`} data-index={index} role="option" aria-selected={index === chosen}
              aria-label={option.name ?? option.label} data-active={index === active}
              onMouseEnter={() => setActive(index)} onClick={() => choose(index)}>
              <span>{option.label}</span>
              {index === chosen && <Check size={16} aria-hidden="true" data-tick />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
