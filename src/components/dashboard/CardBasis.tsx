import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * OMN-21166 part 12 AC73: a card's basis behind an info button. The button is keyboard focusable and names the card; the
 * tooltip opens on hover and on focus and closes on Escape or blur. The tooltip's text is the button's accessible
 * description, so the facts stay in the page for screen readers and for every check that reads them.
 */
export function CardBasis({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="local-card-basis-tip" data-open={open ? 'true' : undefined}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="local-card-info" aria-label={`About ${label}`} aria-describedby={id} aria-expanded={open}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget as HTMLButtonElement).blur(); } }}>
        <Info size={14} aria-hidden="true" />
      </button>
      <div role="tooltip" id={id} className="local-card-tooltip">{children}</div>
    </div>
  );
}
