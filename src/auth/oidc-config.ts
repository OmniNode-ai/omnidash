export interface OidcConfig {
  authority: string;
  client_id: string;
  redirect_uri: string;
}

export function getOidcConfig(): OidcConfig | null {
  const authority = import.meta.env.VITE_OIDC_AUTHORITY as string | undefined;
  if (!authority) return null;
  const client_id = (import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined) ?? 'omnidash';
  return {
    authority,
    client_id,
    redirect_uri: window.location.origin,
  };
}
