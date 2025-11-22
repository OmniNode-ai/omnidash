/**
 * Service URL resolution utilities
 * Centralizes environment variable fallback logic for service endpoints
 */

/**
 * Get the Omniarchon intelligence service base URL
 * Checks multiple environment variables with fallback to localhost
 *
 * Priority order:
 * 1. INTELLIGENCE_SERVICE_URL (server-side preferred)
 * 2. VITE_INTELLIGENCE_SERVICE_URL (client-side fallback)
 * 3. http://localhost:8053 (development default)
 *
 * @returns {string} The base URL for Omniarchon API calls
 */
export function getOmniarchonUrl(): string {
  return (
    process.env.INTELLIGENCE_SERVICE_URL ||
    process.env.VITE_INTELLIGENCE_SERVICE_URL ||
    'http://localhost:8053'
  );
}
