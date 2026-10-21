import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_RUNS_VIEW, writeRunsSearch } from '@/navigation/runs-url-state';
import { failureCauseOf } from './insights';

/**
 * OMN-21166 (approved mockup, 2026-10-18): one filter for the Overview's latest runs, shared by the runs table's own
 * result buttons, the trends' failure causes and the last-visit line's "Show the failures". A filter over served
 * rows only; nothing is fetched or computed beyond which rows to list.
 */
export interface RunFilter {
  result: 'all' | 'passed' | 'failed';
  /** A failure cause as failureCauseOf gives it (the served typed cause, else the detail's label), or none. */
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

/**
 * The cause a failed run's row is filtered by. OMN-19919: the same function the trends group by and the Runs list
 * shows (failureCauseOf), so a cause picked in the trends always matches its runs here and on Runs.
 */
export function causeLabelOf(row: Readonly<Record<string, unknown>>): string {
  return failureCauseOf(row);
}

/** OMN-19919 AC7 (OV-7): the Runs page filtered to the failed runs of one cause, through the Runs URL state. */
export function causeHref(cause: string): string {
  return `/runs?${writeRunsSearch('', { ...DEFAULT_RUNS_VIEW, status: 'failed', cause })}`;
}
