import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/theme';
import { useWebSocketInvalidation } from '@/hooks/useWebSocketInvalidation';
import { SnapshotSourceProvider } from '@/data-source';
import type { ReactNode } from 'react';

function WsInvalidationBridge() {
  useWebSocketInvalidation();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SnapshotSourceProvider>
        <ThemeProvider>
          <WsInvalidationBridge />
          {children}
        </ThemeProvider>
      </SnapshotSourceProvider>
    </QueryClientProvider>
  );
}
