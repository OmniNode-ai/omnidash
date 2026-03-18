import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_roles?: string[];
}

interface AuthResponse {
  // When auth is enabled: { authenticated: boolean, user: AuthUser | null }
  // When auth is disabled: { authEnabled: false }
  authenticated?: boolean;
  authEnabled?: boolean;
  user?: AuthUser | null;
}

export function useAuth() {
  const { data, isLoading } = useQuery<AuthResponse | null>({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // When auth is disabled the server returns { authEnabled: false }.
  // Treat auth-disabled as pass-through: show the dashboard without a login wall.
  const authDisabled = data != null && data.authEnabled === false;

  return {
    user: data?.user ?? null,
    authenticated: authDisabled || (data?.authenticated ?? false),
    isLoading,
  };
}
