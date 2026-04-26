import { useEffect, useState } from 'react';

/**
 * Returns the active dashboard theme name ("dark" | "light"), watching
 * `document.documentElement.dataset.theme` so the caller re-renders on
 * theme toggle. Shared across widgets that need to branch colours
 * per-theme (for example three.js scenes whose materials are hard-
 * coded numeric hex and can't use CSS variables directly).
 *
 * Light is the default when no data-theme attribute is set.
 */
export function useThemeName(): 'light' | 'dark' {
  const [name, setName] = useState<'light' | 'dark'>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  });
  useEffect(() => {
    const update = () => {
      setName(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  return name;
}
