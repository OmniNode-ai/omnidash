/**
 * OMN-23330 (Lakshman 2026-11-11: "when we click any row that should open as popup in center with full details"): the
 * kit's general modal, beside ConfirmDialog and drawn on the same backdrop. Centred over the page (rendered into the
 * document body, so no panel's overflow or transform can clip or move it), it takes focus on its Close button, keeps Tab
 * inside itself, and closes on Close, Escape or a click on the backdrop, returning focus to what opened it.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './dialog.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, title, subtitle, onClose, children }: {
  open: boolean;
  /** The dialog's name, shown as its heading. */
  title: string;
  /** A line under the heading (a run's id). */
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    close.current?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab' || !box.current) return;
    const focusable = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(
    <div className="ds-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={box} className="ds-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div className="ds-dialog-head">
          <div className="ds-dialog-heading">
            <h2 id={titleId} className="ds-dialog-title">{title}</h2>
            {subtitle && <div className="ds-dialog-subtitle">{subtitle}</div>}
          </div>
          <button ref={close} type="button" className="ds-dialog-close" onClick={onClose}>Close</button>
        </div>
        <div className="ds-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
