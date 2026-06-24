/**
 * OMN-12400 — projection-API env guard.
 *
 * A stale machine-local `.env.local` that pins `VITE_PROJECTION_API_URL` at a
 * dead / non-authoritative port (historically `localhost:8765`, the retired SEA
 * demo server) silently breaks the running machine: Vite always loads
 * `.env.local` over `.env`, so the bad value wins and every projection read
 * 404s with no explanation. Fresh checkouts are clean (the file is gitignored),
 * which is exactly why the breakage is invisible until someone debugs it.
 *
 * This guard runs at config-load time (see vite.config.ts). When the resolved
 * `VITE_PROJECTION_API_URL` points at a known non-authoritative port it throws a
 * loud, explanatory error naming the offending value and the fix, instead of
 * letting the dashboard come up against a dead backend.
 *
 * The banned-port set mirrors the source-code guard
 * `eslint-rules/no-non-authoritative-read-source.cjs` (`/:(8765|3010|3002)\b/`):
 *   :8765 — SEA demo server (not the canonical projection backend)
 *   :3010 — merge proxy / demo composite server
 *   :3002 — retired alt-backend (canonical Express bridge is :3003)
 *
 * CORS note (OMN-12400 acceptance part 1): the dashboard never hits the
 * projection API cross-origin. `resolveProjectionBaseUrl()` returns a relative
 * base when `VITE_PROJECTION_API_URL` is set, and the dev/serving layer
 * (vite.proxy-config.ts) forwards same-origin `/projection/*` to the single
 * backend. Direct-API mode is therefore bridge-only by design — CORS headers on
 * the projection API are not required for the dashboard read path.
 */

/** Ports that identify non-authoritative / dead projection origins. */
const BANNED_PROJECTION_PORT_RE = /:(8765|3010|3002)\b/;

/** Env keys whose value must point at the authoritative projection backend. */
const GUARDED_PROJECTION_ENV_KEYS = [
  'VITE_PROJECTION_API_URL',
  'VITE_HTTP_DATA_SOURCE_URL',
] as const;

export type EnvGuardViolation = {
  key: string;
  value: string;
};

/**
 * Return the list of guarded env keys whose value points at a banned port.
 * Pure — takes the resolved env map so it is unit-testable without a real env.
 */
export function findProjectionEnvViolations(
  env: Record<string, string | undefined>,
): EnvGuardViolation[] {
  const violations: EnvGuardViolation[] = [];
  for (const key of GUARDED_PROJECTION_ENV_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && BANNED_PROJECTION_PORT_RE.test(value)) {
      violations.push({ key, value });
    }
  }
  return violations;
}

/** Build the loud, explanatory error message for a set of violations. */
export function formatProjectionEnvError(violations: EnvGuardViolation[]): string {
  const lines = violations.map(
    (v) => `  - ${v.key}=${v.value} (banned port: not the authoritative projection backend)`,
  );
  return [
    'omnidash env guard (OMN-12400): projection backend env points at a non-authoritative / dead port.',
    ...lines,
    '',
    'This is almost always a stale `.env.local` overriding `.env`. Vite loads',
    '`.env.local` over `.env`, so the bad value silently wins and every',
    'projection read 404s. Fix it by removing the offending key from',
    '`.env.local` (or setting it to the authoritative Express bridge, e.g.',
    'http://localhost:3003). Banned ports: :8765 (SEA demo), :3010 (merge',
    'proxy), :3002 (retired alt-backend).',
  ].join('\n');
}

/**
 * Throw if any guarded projection env key points at a banned port.
 * Called from vite.config.ts at config-load time so the failure is immediate
 * and explanatory rather than a silent dead-backend dashboard.
 */
export function assertProjectionEnv(env: Record<string, string | undefined>): void {
  const violations = findProjectionEnvViolations(env);
  if (violations.length > 0) {
    throw new Error(formatProjectionEnvError(violations));
  }
}
