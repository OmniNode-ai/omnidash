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

// OMN-14153: gate the data-fetching tree on a token being in the store.
//
// This must wrap the children rather than sit beside them. `setToken` in a
// useEffect runs after commit, so a sibling component leaves a window where the
// panels have already mounted and issued their first `authedFetch` with a null
// token — those requests go out unauthenticated and 401 once the server runs in
// `required` mode. Writing the store during render (idempotent module-scope
// write) and withholding children until a token exists closes that window.
function AuthGate({ children }: { children: ReactNode }) {
  const { error, isAuthenticated, isLoading, signinRedirect, user } = useAuth();
  const token = user?.access_token ?? null;

  setToken(token);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !error) {
      void signinRedirect();
    }
  }, [error, isAuthenticated, isLoading, signinRedirect]);

  if (error) {
    return <div role="alert">Sign-in failed: {error.message}</div>;
  }

  // Loading, or the redirect to Keycloak is in flight.
  if (isLoading || !isAuthenticated || !token) {
    return null;
  }

  return <>{children}</>;
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
        <AuthGate>
          <InnerProviders>{children}</InnerProviders>
        </AuthGate>
      </AuthProvider>
    );
  }

  return <InnerProviders>{children}</InnerProviders>;
}
