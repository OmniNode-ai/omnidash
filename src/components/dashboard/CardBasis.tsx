import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * OMN-21166 part 29 AC191 (revision 6, after the 20-platform benchmark and Codex's review): a headline card's basis is a
 * short caption under its figure, not a hover popover that covered the next chart's title. The first line is drawn
 * (at most two lines, in 12px secondary text); every line stays in the page in reading order, so a screen reader still
 * hears the pricing, the runs not counted and the window. Supersedes the popover of part 12 AC73 and part 28 AC179.
 */
export function CardBasis({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const caption = useRef<HTMLDivElement>(null);
  // The whole basis is the card's accessible description (Codex MSG a9bd908d), not only text that happens to follow it.
  useEffect(() => {
    const card = caption.current?.closest('article');
    if (!card) return;
    card.setAttribute('aria-describedby', id);
    return () => card.removeAttribute('aria-describedby');
  }, [id]);
  return <div ref={caption} id={id} className="local-card-caption" data-card-basis={label}>{children}</div>;
}
