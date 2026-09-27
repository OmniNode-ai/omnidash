import { createContext, useContext, type ReactNode } from 'react';
import type { ModelExecutionGraph, ModelExecutionGraphSourceCursor } from './render-model';

export interface ExecutionGraphTransport {
  /** Submit the generic authorized read workflow; auth/tenant come from gateway context. */
  readLatest: (correlationId: string) => Promise<ModelExecutionGraph>;
  /** Fixture-only until an adjacent-bound workflow contract exists. */
  step?: (
    correlationId: string,
    currentCursors: readonly ModelExecutionGraphSourceCursor[],
    direction: 'previous' | 'next',
  ) => Promise<ModelExecutionGraph | null>;
}

const ExecutionGraphTransportContext = createContext<ExecutionGraphTransport | null>(null);

export function ExecutionGraphTransportProvider({
  children,
  transport,
}: {
  children: ReactNode;
  transport: ExecutionGraphTransport;
}) {
  return (
    <ExecutionGraphTransportContext.Provider value={transport}>
      {children}
    </ExecutionGraphTransportContext.Provider>
  );
}

export function useExecutionGraphTransport(): ExecutionGraphTransport | null {
  return useContext(ExecutionGraphTransportContext);
}
