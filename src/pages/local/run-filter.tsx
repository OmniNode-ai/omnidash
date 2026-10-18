import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * OMN-21166 (approved mockup, 2026-10-18): one filter for the Overview's latest runs, shared by the runs table's own
 * result buttons, the trends' failure causes and the last-visit line's "Show the failures". A filter over served
 * rows only; nothing is fetched or computed beyond which rows to list.
 */
export interface RunFilter {
  result: 'all' | 'passed' | 'failed';
  /** A failure cause label (the text before the first colon of a served quality_gate_detail), or none. */
  cause: string | null;
}

interface RunFilterState {
  filter: RunFilter;
  setFilter: (next: Partial<RunFilter>) => void;
}

const RunFilterContext = createContext<RunFilterState | null>(null);

export function RunFilterProvider({ children }: { children: ReactNode }) {
  const [filter, set] = useState<RunFilter>({ result: 'all', cause: null });
  return (
    <RunFilterContext.Provider value={{ filter, setFilter: next => set(current => ({ ...current, ...next })) }}>
      {children}
    </RunFilterContext.Provider>
  );
}

/** The shared filter when the page provides one; otherwise null, and a table keeps a filter of its own. */
export function useSharedRunFilter(): RunFilterState | null {
  return useContext(RunFilterContext);
}

/** A run table's filter: the shared one on the Overview, or its own when rendered alone. */
export function useRunFilter(): RunFilterState {
  const shared = useContext(RunFilterContext);
  const [own, set] = useState<RunFilter>({ result: 'all', cause: null });
  return shared ?? { filter: own, setFilter: next => set(current => ({ ...current, ...next })) };
}

/** The cause label a served failure detail leads with ("MALFORMED: ..." → "MALFORMED"). */
export function causeLabelOf(detail: unknown): string | null {
  if (typeof detail !== 'string' || detail.trim() === '') return null;
  const head = detail.split(':')[0]!.trim();
  return head === '' ? null : head;
}
