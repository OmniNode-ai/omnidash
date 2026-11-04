/**
 * OMN-22168 AC4: the one confirmation dialog of the local pages (Lakshman 2026-11-04: a download asks first, "so that if
 * someone mistakenly clicks they will not download mistakenly"). A modal over the page: it names what will happen,
 * starts on Cancel so Enter on an accidental open does nothing, keeps Tab inside its two buttons, and closes on Cancel,
 * Escape or a click on the backdrop without acting. Only the confirm button acts.
 */
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import './confirm-dialog.css';

export function ConfirmDialog({ open, title, children, confirmLabel, icon, tone = 'blue', onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  /** A glyph from the icon registry, shown beside the title and on the confirm button. */
  icon?: ReactNode;
  /** The design-system hue the dialog's accent takes. */
  tone?: 'blue' | 'green' | 'purple' | 'amber' | 'teal';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    cancel.current?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onCancel(); return; }
    if (event.key !== 'Tab') return;
    // Two buttons: Tab and Shift+Tab move between them and never leave the dialog.
    event.preventDefault();
    (document.activeElement === cancel.current ? confirm : cancel).current?.focus();
  };
  return (
    <div className="ds-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="ds-confirm" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={children ? bodyId : undefined}
        data-tone={tone} onKeyDown={onKeyDown}>
        <h2 id={titleId} className="ds-confirm-title">{icon && <span className="ds-confirm-icon" aria-hidden="true">{icon}</span>}{title}</h2>
        {children && <div id={bodyId} className="ds-confirm-body">{children}</div>}
        <div className="ds-confirm-actions">
          <button ref={cancel} type="button" className="ds-confirm-cancel" onClick={onCancel}>Cancel</button>
          <button ref={confirm} type="button" className="ds-confirm-ok" onClick={onConfirm}>
            {icon && <span aria-hidden="true">{icon}</span>}{confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
