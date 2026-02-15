/**
 * Shared API Base URL Helper
 *
 * Builds data-source base URLs from the VITE_API_BASE_URL environment variable.
 * Falls back to '' (same-origin) when the variable is undefined, which is the
 * normal case for the Vite dev server proxy and production same-origin deploys.
 *
 * Non-root or cross-origin deployments can set VITE_API_BASE_URL in .env to
 * override (e.g. "https://api.example.com").
 */

function getApiBase(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? (import.meta.env.VITE_API_BASE_URL as string)
      : '';
  // Strip trailing slashes to prevent double-slash paths
  return raw.replace(/\/+$/, '');
}

/**
 * Build a fully-qualified API base URL for a resource path.
 *
 * @param resourcePath - The API path segment, e.g. '/api/baselines'
 * @returns The combined URL, e.g. 'https://api.example.com/api/baselines' or '/api/baselines'
 */
export function buildApiUrl(resourcePath: string): string {
  return `${getApiBase()}${resourcePath}`;
}
