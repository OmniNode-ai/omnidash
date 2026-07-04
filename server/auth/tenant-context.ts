// OMN-13824 / OMN-1636: request-scoped tenant context.
//
// The tenant identity extracted from the verified OIDC access token is carried
// through the async request chain via AsyncLocalStorage so the data-access
// layer (PostgresProjectionReader) can scope every query with the Postgres
// `app.tenant_id` GUC that the RLS policies key on (db/migrations/0001).
//
// Fail-closed contract: when no tenant context is active the reader does NOT
// set the GUC, and the RLS policy `tenant_id = current_setting('app.tenant_id',
// true)` evaluates NULL -> false for non-owner roles, returning zero rows.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  /** Tenant identifier from the token's tenant claim (e.g. `tenant_id`). */
  tenantId: string;
  /** OIDC subject (`sub`) of the authenticated principal, when present. */
  subject: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` with the given tenant context active for its whole async subtree. */
export function runWithTenantContext<T>(context: TenantContext, fn: () => T): T {
  if (!context.tenantId || context.tenantId.trim() === '') {
    // Never allow an empty tenant to masquerade as an authenticated context.
    throw new Error('runWithTenantContext requires a non-empty tenantId');
  }
  return storage.run(context, fn);
}

/** The active tenant context, or null outside an authenticated request. */
export function getTenantContext(): TenantContext | null {
  return storage.getStore() ?? null;
}

/** The active tenant id, or null outside an authenticated request. */
export function getActiveTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}
