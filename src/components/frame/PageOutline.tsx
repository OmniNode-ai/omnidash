import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDownRight } from 'lucide-react';
import '@/styles/page-outline.css';

/** Navigation over rendered sections only. It reads headings, never data or
 * backend state. Keeping the targets as elements avoids changing route hashes. */
export function PageOutline({ root, scrollRoot = root }: {
  root: RefObject<HTMLElement | null>;
  scrollRoot?: RefObject<HTMLElement | null>;
}) {
  const navigation = useRef<HTMLElement>(null);
  const targets = useRef<HTMLElement[]>([]);
  const current = useRef<HTMLElement | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const element = root.current;
    const scroller = scrollRoot.current;
    if (!element || !scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const barHeight = navigation.current?.offsetHeight ?? 0;
      const inset = Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      element.style.setProperty('--page-outline-offset', `${barHeight + inset + 20}px`);
      const boundary = scroller.getBoundingClientRect().top + barHeight + inset + 24;
      let candidate: HTMLElement | undefined = targets.current[0];
      for (const heading of targets.current) {
        if (heading.getBoundingClientRect().top <= boundary) candidate = heading;
      }
      // Side-by-side cards share a scroll position: retain the user's choice.
      if (candidate && current.current && targets.current.includes(current.current)
        && Math.abs(candidate.getBoundingClientRect().top - current.current.getBoundingClientRect().top) < 4) {
        candidate = current.current;
      }
      if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        candidate = targets.current.at(-1);
      }
      current.current = candidate ?? null;
      setActive(candidate ? Math.max(0, targets.current.indexOf(candidate)) : 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const refresh = () => {
      targets.current = [...element.querySelectorAll<HTMLElement>('[data-page-heading]')]
        .filter(heading => heading.getClientRects().length > 0 && heading.textContent?.trim());
      const next = targets.current.map(heading => heading.textContent!.trim());
      setLabels(current => current.join('\u0000') === next.join('\u0000') ? current : next);
      schedule();
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(element, { childList: true, subtree: true });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (navigation.current) resize?.observe(navigation.current);
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', refresh);
    return () => {
      observer.disconnect();
      resize?.disconnect();
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', refresh);
      cancelAnimationFrame(frame);
      element.style.removeProperty('--page-outline-offset');
    };
  }, [root, scrollRoot, labels.length]);
  useEffect(() => {
    const bar = navigation.current;
    const button = bar?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!bar || !button) return;
    if (button.offsetLeft < bar.scrollLeft) bar.scrollLeft = button.offsetLeft;
    else if (button.offsetLeft + button.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollLeft = button.offsetLeft + button.offsetWidth - bar.clientWidth;
    }
  }, [active, labels]);
  if (labels.length < 2) return null;
  return <nav ref={navigation} className="page-outline" aria-label="On this page">
    <span className="page-outline-label"><ArrowDownRight size={14} aria-hidden="true" />On this page</span>
    {labels.map((label, index) => <button type="button" key={`${label}-${index}`}
      aria-current={index === active ? 'location' : undefined} onClick={() => {
      const target = targets.current[index];
      if (!target) return;
      current.current = target;
      setActive(index);
      target.scrollIntoView({ block: 'start', behavior: 'instant' });
      target.focus({ preventScroll: true });
    }}>{label}</button>)}
  </nav>;
}
