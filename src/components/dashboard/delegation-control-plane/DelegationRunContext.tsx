import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DelegationEvidenceSnapshot, DelegationRun } from './delegation-control-plane.types';
import { useDelegationEvidenceSnapshot } from './useDelegationEvidenceSnapshot';

export interface DelegationRunFilter {
  taskType: string | null;
  status: DelegationRun['status'] | null;
}

export interface DelegationRunContextValue {
  snapshot: DelegationEvidenceSnapshot;
  selectedRunId: string | null;
  selectedRun: DelegationRun | null;
  filter: DelegationRunFilter;
  filteredRuns: DelegationRun[];
  selectRun: (runId: string) => void;
  setFilter: (patch: Partial<DelegationRunFilter>) => void;
  clearFilter: () => void;
  isFixture: boolean;
}

const DelegationRunContext = createContext<DelegationRunContextValue | null>(null);

const EMPTY_FILTER: DelegationRunFilter = { taskType: null, status: null };

function applyFilter(runs: DelegationRun[], filter: DelegationRunFilter): DelegationRun[] {
  return runs.filter((run) => {
    if (filter.taskType && run.taskType !== filter.taskType) return false;
    if (filter.status && run.status !== filter.status) return false;
    return true;
  });
}

export function DelegationRunProvider({
  children,
  isFixture = false,
}: {
  children: ReactNode;
  isFixture?: boolean;
}) {
  const snapshot = useDelegationEvidenceSnapshot();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filter, setFilterState] = useState<DelegationRunFilter>(EMPTY_FILTER);

  const filteredRuns = useMemo(() => applyFilter(snapshot.runs, filter), [snapshot.runs, filter]);

  const selectedRun = useMemo(() => {
    const candidate = filteredRuns.find((run) => run.id === selectedRunId) ?? filteredRuns[0] ?? null;
    return candidate;
  }, [selectedRunId, filteredRuns]);

  const selectRun = useCallback((runId: string) => setSelectedRunId(runId), []);

  const setFilter = useCallback(
    (patch: Partial<DelegationRunFilter>) => setFilterState((prev) => ({ ...prev, ...patch })),
    [],
  );

  const clearFilter = useCallback(() => setFilterState(EMPTY_FILTER), []);

  const value = useMemo<DelegationRunContextValue>(
    () => ({ snapshot, selectedRunId, selectedRun, filter, filteredRuns, selectRun, setFilter, clearFilter, isFixture }),
    [snapshot, selectedRunId, selectedRun, filter, filteredRuns, selectRun, setFilter, clearFilter, isFixture],
  );

  return <DelegationRunContext.Provider value={value}>{children}</DelegationRunContext.Provider>;
}

export function useDelegationRunContext(): DelegationRunContextValue {
  const ctx = useContext(DelegationRunContext);
  if (!ctx) throw new Error('useDelegationRunContext must be used within a DelegationRunProvider');
  return ctx;
}

export function useDelegationRunContextOptional(): DelegationRunContextValue | null {
  return useContext(DelegationRunContext);
}
