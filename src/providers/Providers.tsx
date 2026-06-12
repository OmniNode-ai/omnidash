import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/theme';
import { SnapshotSourceProvider } from '@/data-source';
import type { ReactNode } from 'react';

// OMN-12969: the WebSocket invalidation bridge was removed. The deployed
// projection backend (FastAPI projection-api on :13002) serves HTTP/SSE only
// and has no `/ws` route, so the browser's `ws://<host>/ws` upgrade was
// rejected (403) and the bridge never delivered an INVALIDATE frame. Panels
// are poll-only via `useProjectionQuery`'s refetchInterval; that is the
// authoritative live-update path. See docs and `local/no-projection-websocket`.

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SnapshotSourceProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </SnapshotSourceProvider>
    </QueryClientProvider>
  );
}
