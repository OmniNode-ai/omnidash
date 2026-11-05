/**
 * OMN-22168 AC4: the one tooltip of the local pages. It shows on pointer hover and on keyboard focus, describes its
 * target while shown (aria-describedby), and hides on leave, blur and Escape. InfoTip is a small named "i" button for a
 * figure or heading whose meaning needs a sentence; the sentence lives here instead of as helper text on the page.
 */
import { cloneElement, isValidElement, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Info } from '@/theme/design-system/icons';
import './tooltip.css';

/**
 * The visible box a tooltip must stay inside: the viewport, narrowed by every ancestor that clips sideways (a table that
 * scrolls in its panel). Measured, never assumed (OMN-22168, 2026-11-05: a column's tooltip ran 41 to 176px past a
 * scrolled table and off a 390px screen).
 */
function visibleBox(element: HTMLElement): { left: number; right: number } {
  let left = 0;
  let right = window.innerWidth;
  for (let node = element.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowX;
    if (overflow === 'visible') continue;
    const box = node.getBoundingClientRect();
    left = Math.max(left, box.left);
    right = Math.min(right, box.right);
  }
  return { left, right };
}

export function Tooltip({ text, children, side = 'top' }: { text: ReactNode; children: ReactElement; side?: 'top' | 'bottom' }) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const tip = useRef<HTMLSpanElement>(null);
  // Once drawn, the tooltip slides sideways (CSS translate, kept apart from any transform its stylesheet sets) just enough
  // to sit inside the visible box, 8px from its edge.
  useLayoutEffect(() => {
    const node = tip.current;
    if (!shown || !node) return;
    node.style.translate = '';
    const bounds = visibleBox(node);
    const margin = 8;
    // Narrower than the visible box first (at 390px a 280px tooltip was 51px wider than its table), then slid into it.
    node.style.maxWidth = `${Math.max(120, Math.min(280, Math.floor(bounds.right - bounds.left - 2 * margin)))}px`;
    const box = node.getBoundingClientRect();
    let shift = 0;
    if (box.right > bounds.right - margin) shift = bounds.right - margin - box.right;
    if (box.left + shift < bounds.left + margin) shift = bounds.left + margin - box.left;
    if (shift !== 0) node.style.translate = `${Math.round(shift)}px 0`;
    // Lakshman 2026-11-05 ("our tooltip should have arrow like this and point to origin of source"): the arrow sits
    // under (or over) the centre of what was hovered, wherever the slide above put the tooltip, kept 10px from a corner.
    const anchor = node.parentElement?.firstElementChild?.getBoundingClientRect();
    if (anchor) {
      const left = box.left + shift;
      const arrow = Math.min(Math.max(anchor.left + anchor.width / 2 - left, 10), box.width - 10);
      node.style.setProperty('--ds-tooltip-arrow-x', `${Math.round(arrow)}px`);
    }
  }, [shown]);
  if (!isValidElement<Record<string, unknown>>(children)) return children;
  const child = children as ReactElement<Record<string, unknown>>;
  const props = child.props as { onFocus?: (e: unknown) => void; onBlur?: (e: unknown) => void; onKeyDown?: (e: KeyboardEvent) => void };
  const target = cloneElement(child, {
    'aria-describedby': shown ? id : undefined,
    onFocus: (event: unknown) => { props.onFocus?.(event); setShown(true); },
    onBlur: (event: unknown) => { props.onBlur?.(event); setShown(false); },
    onKeyDown: (event: KeyboardEvent) => { props.onKeyDown?.(event); if (event.key === 'Escape') setShown(false); },
  });
  return (
    <span className="ds-tooltip-anchor" onMouseEnter={() => setShown(true)} onMouseLeave={() => setShown(false)}>
      {target}
      {shown && <span ref={tip} id={id} role="tooltip" className="ds-tooltip" data-side={side}>{text}</span>}
    </span>
  );
}

export function InfoTip({ label, text, side }: { label: string; text: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <Tooltip text={text} side={side}>
      <button type="button" className="ds-infotip" aria-label={label}><Info size={14} aria-hidden="true" /></button>
    </Tooltip>
  );
}
