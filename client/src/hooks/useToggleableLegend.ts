/**
 * useToggleableLegend — shared legend toggle state primitive
 *
 * Works with any visualization that has named series (Recharts, tables, etc).
 * Starts with all keys active. Toggle removes/restores a key. setOnly shows
 * exactly one. reset() returns to all-visible.
 *
 * State is a Set<string> of *hidden* keys (empty = all visible), which avoids
 * needing to know all keys up front — any key not in the Set is active.
 */

import { useCallback, useState } from 'react';

export interface ToggleableLegendState {
  /** Set of currently-hidden series keys */
  hiddenKeys: Set<string>;

  /** Returns true if the given key is currently visible */
  isActive: (key: string) => boolean;

  /** Toggle a single key on/off */
  toggle: (key: string) => void;

  /** Show only this key, hide everything else. Requires allKeys so we know what to hide. */
  setOnly: (key: string, allKeys: string[]) => void;

  /** Reset to all-visible */
  reset: () => void;
}

export function useToggleableLegend(): ToggleableLegendState {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const isActive = useCallback((key: string) => !hiddenKeys.has(key), [hiddenKeys]);

  const toggle = useCallback((key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const setOnly = useCallback((key: string, allKeys: string[]) => {
    setHiddenKeys(new Set(allKeys.filter((k) => k !== key)));
  }, []);

  const reset = useCallback(() => {
    setHiddenKeys(new Set());
  }, []);

  return { hiddenKeys, isActive, toggle, setOnly, reset };
}
