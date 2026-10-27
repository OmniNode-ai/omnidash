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
    // Part 28 AC179: directly under its card, on the card's left edge (its right edge when the left would leave the
    // viewport), above only when it fits there and not below; never beside the card. It may cover what lies below, since
    // it closes as soon as the pointer or focus leaves the card.
    const cardBox = card.getBoundingClientRect();
    const bubbleHeight = bubble.getBoundingClientRect().height;
    const width = Math.min(window.innerWidth - 24, Math.max(260, Math.min(320, cardBox.width)));
    const above = cardBox.bottom + bubbleHeight + 8 > window.innerHeight - 12 && cardBox.top - bubbleHeight - 8 >= 12;
    const top = above ? cardBox.top - bubbleHeight - 8 : cardBox.bottom + 8;
    let left = cardBox.left;
    if (left + width > window.innerWidth - 12) left = cardBox.right - width;
    left = Math.max(12, left);
    setSide(above ? 'above' : 'below');
    // Fixed bubble is outside the card's scrollable overflow, so the card keeps its own width.
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
