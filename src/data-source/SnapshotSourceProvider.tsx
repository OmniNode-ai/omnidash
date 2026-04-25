// T15 / OMN-156: SnapshotSource singleton via React context.
//
// The data-source client is created once at app root and shared by all
// widgets via context. Tests can wrap their tree in a different provider
// with a mock source — no env-var dance, no rebuild. See
// docs/plans/2026-04-25-review-remediation.md Task 15.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { createSnapshotSource } from './index';

const SnapshotSourceContext = createContext<ProtocolSnapshotSource | null>(null);

interface SnapshotSourceProviderProps {
  /** Override the source (used by tests + Storybook). Defaults to `createSnapshotSource()`. */
  source?: ProtocolSnapshotSource;
  children: ReactNode;
}

export function SnapshotSourceProvider({ source, children }: SnapshotSourceProviderProps) {
  const value = useMemo(() => source ?? createSnapshotSource(), [source]);
  return (
    <SnapshotSourceContext.Provider value={value}>{children}</SnapshotSourceContext.Provider>
  );
}

/**
 * Read the snapshot source from context. Throws a descriptive error when
 * called outside a `SnapshotSourceProvider` so misuse fails loudly during
 * development instead of falling through to a silently-constructed source.
 */
export function useSnapshotSource(): ProtocolSnapshotSource {
  const value = useContext(SnapshotSourceContext);
  if (!value) {
    throw new Error(
      'useSnapshotSource() called outside <SnapshotSourceProvider>. Wrap your tree (or test) in the provider.',
    );
  }
  return value;
}
