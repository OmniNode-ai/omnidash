import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * OMN-21166 part 12 AC73: a card's basis behind an info button. The button is keyboard focusable and names the card; the
 * tooltip opens on hover and on focus and closes on Escape or blur. The tooltip's text is the button's accessible
 * description, so the facts stay in the page for screen readers and for every check that reads them.
 */
export function CardBasis({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties | undefined>();
  const [side, setSide] = useState<'above' | 'below'>('below');
  useLayoutEffect(() => {
    const card = root.current?.closest<HTMLElement>('.local-overview-summary > .local-dashboard-panel');
    if (!card) return;
    const enter = () => setOpen(true);
    const leave = () => setOpen(false);
    card.addEventListener('mouseenter', enter);
    card.addEventListener('mouseleave', leave);
    return () => { card.removeEventListener('mouseenter', enter); card.removeEventListener('mouseleave', leave); };
  }, []);
  useLayoutEffect(() => {
    if (!open) {
      setPosition(undefined);
      return;
    }
    const card = root.current?.closest<HTMLElement>('.local-overview-summary > .local-dashboard-panel');
    const bubble = tip.current;
    if (!card || !bubble) return;
    const cardBox = card.getBoundingClientRect();
    const bubbleHeight = bubble.getBoundingClientRect().height;
    const width = Math.min(300, window.innerWidth - 24);
    let above = cardBox.top >= bubbleHeight + 24 && cardBox.bottom + bubbleHeight + 24 > window.innerHeight;
    let top = above ? cardBox.top - bubbleHeight - 12 : cardBox.bottom + 12;
    const clampLeft = (value: number) => Math.max(12, Math.min(value, window.innerWidth - width - 12));
    const candidates = [...new Set([
      cardBox.left, cardBox.right - width, cardBox.left + (cardBox.width - width) / 2,
      cardBox.left - width - 12, cardBox.right + 12,
    ].map(clampLeft))];
    const controls = [...document.querySelectorAll<HTMLElement>('.local-chart-expand')].map(control => control.getBoundingClientRect());
    const overlap = (left: number, top: number) => controls.reduce((area, control) => area +
      Math.max(0, Math.min(left + width, control.right) - Math.max(left, control.left)) *
      Math.max(0, Math.min(top + bubbleHeight, control.bottom) - Math.max(top, control.top)), 0);
    const pickLeft = (atTop: number) => candidates.sort((a, b) => overlap(a, atTop) - overlap(b, atTop)
      || Math.abs(a - cardBox.left) - Math.abs(b - cardBox.left))[0]!;
    let left = pickLeft(top);
    if (!above && overlap(left, top) > 0 && cardBox.top >= bubbleHeight + 24) {
      above = true;
      top = cardBox.top - bubbleHeight - 12;
      left = pickLeft(top);
    }
    setSide(above ? 'above' : 'below');
    // Fixed bubble is outside the card's scrollable overflow, so the card keeps its own width; AC147 placement unchanged.
    setPosition({ position: 'fixed', left: left, right: 'auto', bottom: 'auto', top: top,
      width, maxWidth: 'none', maxHeight: `calc(100dvh - 24px)`, overflowY: 'auto', transform: 'none' });
    const closeOnScroll = () => setOpen(false);
    const closeOnResize = () => setOpen(false);
    window.addEventListener('scroll', closeOnScroll, { capture: true, passive: true });
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('scroll', closeOnScroll, { capture: true });
      window.removeEventListener('resize', closeOnResize);
    };
  }, [open]);
  return (
    <div ref={root} className="local-card-basis-tip" data-open={open ? 'true' : undefined}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="local-card-info" aria-label={`About ${label}`} aria-describedby={id} aria-expanded={open}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onKeyDown={(event) => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget as HTMLButtonElement).blur(); } }}>
        <Info size={14} aria-hidden="true" />
      </button>
      <div ref={tip} role="tooltip" id={id} className="local-card-tooltip" data-placement={side} style={position}>{children}</div>
    </div>
  );
}
