/**
 * OMN-22168 AC4: the one tooltip of the local pages. It shows on pointer hover and on keyboard focus, describes its
 * target while shown (aria-describedby), and hides on leave, blur and Escape. InfoTip is a small named "i" button for a
 * figure or heading whose meaning needs a sentence; the sentence lives here instead of as helper text on the page.
 */
import { cloneElement, isValidElement, useId, useState, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { Info } from '@/theme/design-system/icons';
import './tooltip.css';

export function Tooltip({ text, children, side = 'top' }: { text: ReactNode; children: ReactElement; side?: 'top' | 'bottom' }) {
  const [shown, setShown] = useState(false);
  const id = useId();
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
      {shown && <span id={id} role="tooltip" className="ds-tooltip" data-side={side}>{text}</span>}
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
