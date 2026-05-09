// T15 (OMN-156): test wrapper that pairs QueryClientProvider with
// SnapshotSourceProvider. Most widget tests stub global fetch and rely on
// FileSnapshotSource, so we default to that explicitly.
//
// JSDoc rationale (OMN-10756): explicit FileSnapshotSource default added so that
// tests are isolated from contract.yaml's production default (sqlite). Without
// an explicit source, createSnapshotSource() would pick up the contract default
// and use HttpSnapshotSource, breaking all fixture-based component tests.
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnapshotSourceProvider, FileSnapshotSource, type ProtocolSnapshotSource } from '@/data-source';

const DEFAULT_TEST_SOURCE = new FileSnapshotSource({ baseUrl: '/_fixtures' });

interface ProviderProps {
  client: QueryClient;
  source?: ProtocolSnapshotSource;
  children: ReactNode;
}

export function DataSourceTestProvider({ client, source, children }: ProviderProps) {
  return (
    <QueryClientProvider client={client}>
      <SnapshotSourceProvider source={source ?? DEFAULT_TEST_SOURCE}>{children}</SnapshotSourceProvider>
    </QueryClientProvider>
  );
}
