// T15 / OMN-156: SnapshotSource singleton via React context.
//
// The data-source client is created once at app root and shared by all
// widgets via context. Tests can wrap their tree in a different provider
// with a mock source — no env-var dance, no rebuild. See
// docs/plans/2026-04-25-review-remediation.md Task 15.
//
// OMN-13007: when the chrome DATA SOURCE control switches mode/backend at
// runtime, the memoized source is recreated against the new effective source
// and every cached query is invalidated so widgets refetch from the new
// backend. An explicit `source` prop (tests/Storybook) opts out of this — it is
// authoritative and never recreated.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { createSnapshotSource } from './index';
import { useDataSourceOverride } from './useDataSourceOverride';

const SnapshotSourceContext = createContext<ProtocolSnapshotSource | null>(null);

interface SnapshotSourceProviderProps {
  /** Override the source (used by tests + Storybook). Defaults to `createSnapshotSource()`. */
  source?: ProtocolSnapshotSource;
  children: ReactNode;
}

export function SnapshotSourceProvider({ source, children }: SnapshotSourceProviderProps) {
  // Subscribe to the runtime override so a switch recreates the source.
  const override = useDataSourceOverride();
  const queryClient = useQueryClient();

  // Recreate the source whenever the override identity changes (mode or base
  // URL). `createSnapshotSource()` reads the latest effective source internally;
  // we thread `override` through so the memo recomputes on a runtime switch.
  // Tests that inject `source` bypass the override entirely.
  const value = useMemo(() => {
    void override; // dependency: recreate the source when the override changes
    return source ?? createSnapshotSource();
  }, [source, override]);

  // After the first render, an override change means the active backend moved —
  // drop cached query data so panels refetch from the new source. Skip the
  // mount pass so we don't gratuitously invalidate on initial load.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (source) return; // injected source: caller owns invalidation
    void queryClient.invalidateQueries();
  }, [override, source, queryClient]);

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
