import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/theme';
import { SnapshotSourceProvider } from '@/data-source';
import { getOidcConfig } from '@/auth/oidc-config';
import { setToken } from '@/auth/token-store';
import type { ReactNode } from 'react';

// OMN-12969: the WebSocket invalidation bridge was removed. The deployed
// projection backend (FastAPI projection-api on :13002) serves HTTP/SSE only
// and has no `/ws` route, so the browser's `ws://<host>/ws` upgrade was
// rejected (403) and the bridge never delivered an INVALIDATE frame. Panels
// are poll-only via `useProjectionQuery`'s refetchInterval; that is the
// authoritative live-update path. See docs and `local/no-projection-websocket`.

function TokenSync() {
  const { error, isAuthenticated, isLoading, signinRedirect, user } = useAuth();

  useEffect(() => {
    setToken(user?.access_token ?? null);
  }, [user?.access_token]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void signinRedirect();
    }
  }, [error, isAuthenticated, isLoading, signinRedirect]);

  return null;
}

function InnerProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SnapshotSourceProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </SnapshotSourceProvider>
    </QueryClientProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const oidcConfig = getOidcConfig();

  if (oidcConfig) {
    return (
      <AuthProvider
        authority={oidcConfig.authority}
        client_id={oidcConfig.client_id}
        redirect_uri={oidcConfig.redirect_uri}
        onSigninCallback={() => {
          window.history.replaceState({}, document.title, window.location.pathname);
        }}
      >
        <TokenSync />
        <InnerProviders>{children}</InnerProviders>
      </AuthProvider>
    );
  }

  return <InnerProviders>{children}</InnerProviders>;
}
