// T15 (OMN-156): test wrapper that pairs QueryClientProvider with
// SnapshotSourceProvider. Most widget tests stub global fetch and rely on
// the default FileSnapshotSource, so we use the same default here — only
// the provider plumbing is new.
import type { ReactNode } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnapshotSourceProvider, type ProtocolSnapshotSource } from '@/data-source';

interface ProviderProps {
  client: QueryClient;
  source?: ProtocolSnapshotSource;
  children: ReactNode;
}

export function DataSourceTestProvider({ client, source, children }: ProviderProps) {
  return (
    <QueryClientProvider client={client}>
      <SnapshotSourceProvider source={source}>{children}</SnapshotSourceProvider>
    </QueryClientProvider>
  );
}
