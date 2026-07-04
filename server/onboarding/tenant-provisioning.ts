// OMN-10875: idempotent tenant provisioning for self-service onboarding.
//
// One tenant per OIDC subject: `tenants.created_by_subject` is UNIQUE
// (db/migrations/0002_tenant_onboarding.sql), and provisioning is
// INSERT ... ON CONFLICT DO NOTHING followed by a re-read, so concurrent or
// repeated calls for the same user always converge on the same tenant row —
// the OMN-10875 "repeated visits do not create duplicate tenants" criterion.
//
// Identity triple (OMN-12911 design): tenant_id is minted once and immutable;
// principal_id is DERIVED deterministically from tenant_id (sha-256), never
// from the slug — a slug rename must never rotate the principal.
//
// Per-tenant credentials (broker principal + confidential client) are the
// OMN-12911 P0B surface, which is unstarted; this module deliberately returns
// a typed `deferred` credentials stub instead of minting anything.

import { createHash, randomUUID } from 'node:crypto';
import type { ApplyPlanStep, KeycloakAdminClient } from './keycloak-admin.js';

/** Minimal query surface — satisfied by pg.Pool and by test fakes. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface TenantRecord {
  tenantId: string;
  tenantSlug: string;
  principalId: string;
  displayName: string;
  status: string;
  createdAt: string;
}

export interface ProvisionRequest {
  /** OIDC `sub` of the signing-up user. */
  subject: string;
  email?: string | null;
  requestedSlug?: string | null;
  displayName?: string | null;
}

export interface CredentialsStatus {
  status: 'deferred';
  reason: string;
  ticket: 'OMN-12911';
}

export interface ProvisionResult {
  outcome: 'created' | 'existing';
  tenant: TenantRecord;
  keycloak: { applied: boolean; plan: ApplyPlanStep[] };
  credentials: CredentialsStatus;
}

const SLUG_MAX_LENGTH = 40;
const SLUG_COLLISION_ATTEMPTS = 5;
/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

const CREDENTIALS_DEFERRED: CredentialsStatus = {
  status: 'deferred',
  reason:
    'per-tenant broker credentials are the OMN-12911 P0B surface (per-tenant '
    + 'confidential client + quotas); not minted by onboarding until P0B lands',
  ticket: 'OMN-12911',
};

/**
 * Normalize a requested slug (or an email local-part fallback) into
 * [a-z0-9-], collapsed, trimmed, length-capped. Returns null when nothing
 * usable remains — callers then fall back to a generated slug.
 */
export function normalizeSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  return slug.length >= 2 ? slug : null;
}

/**
 * principal_id derivation — deterministic over tenant_id ONLY (OMN-12911:
 * slug rename must never rotate the principal).
 */
export function derivePrincipalId(tenantId: string): string {
  const digest = createHash('sha256').update(tenantId, 'utf8').digest('hex');
  return `principal:${digest.slice(0, 32)}`;
}

function rowToTenant(row: Record<string, unknown>): TenantRecord {
  return {
    tenantId: String(row.tenant_id),
    tenantSlug: String(row.tenant_slug),
    principalId: String(row.principal_id),
    displayName: String(row.display_name),
    status: String(row.status),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

const SELECT_BY_SUBJECT =
  'SELECT tenant_id, tenant_slug, principal_id, display_name, status, created_at '
  + 'FROM tenants WHERE created_by_subject = $1';

export interface TenantProvisionerOptions {
  db: Queryable;
  keycloak: KeycloakAdminClient;
}

export interface TenantProvisioner {
  /** Idempotently provision (or return) the subject's tenant. */
  provision(request: ProvisionRequest): Promise<ProvisionResult>;
  /** The subject's tenant, or null when not yet provisioned. */
  lookup(subject: string): Promise<TenantRecord | null>;
}

export function createTenantProvisioner(options: TenantProvisionerOptions): TenantProvisioner {
  const { db, keycloak } = options;

  async function lookup(subject: string): Promise<TenantRecord | null> {
    const { rows } = await db.query(SELECT_BY_SUBJECT, [subject]);
    return rows.length > 0 ? rowToTenant(rows[0]) : null;
  }

  async function insertTenant(request: ProvisionRequest): Promise<void> {
    const baseSlug =
      normalizeSlug(request.requestedSlug)
      ?? normalizeSlug(request.email?.split('@')[0])
      ?? null;
    const tenantId = `t_${randomUUID().replace(/-/g, '')}`;
    const principalId = derivePrincipalId(tenantId);
    const fallbackSlug = `tenant-${tenantId.slice(2, 10)}`;
    const displayName =
      request.displayName?.trim() || baseSlug || fallbackSlug;

    for (let attempt = 0; attempt < SLUG_COLLISION_ATTEMPTS; attempt += 1) {
      const slug =
        attempt === 0
          ? (baseSlug ?? fallbackSlug)
          : `${baseSlug ?? fallbackSlug}-${tenantId.slice(2, 2 + 2 + attempt)}`;
      try {
        await db.query(
          'INSERT INTO tenants '
          + '(tenant_id, tenant_slug, principal_id, display_name, status, '
          + 'created_by_subject, created_by_email) '
          + "VALUES ($1, $2, $3, $4, 'active', $5, $6) "
          + 'ON CONFLICT (created_by_subject) DO NOTHING',
          [tenantId, slug, principalId, displayName, request.subject, request.email ?? null],
        );
        return;
      } catch (err) {
        const code = (err as { code?: string }).code;
        // Slug already taken by ANOTHER subject -> retry with a suffix.
        // (Same-subject re-entry never lands here: ON CONFLICT on the
        // created_by_subject unique swallows it.)
        if (code === UNIQUE_VIOLATION && attempt < SLUG_COLLISION_ATTEMPTS - 1) {
          continue;
        }
        throw err;
      }
    }
  }

  return {
    lookup,

    async provision(request: ProvisionRequest): Promise<ProvisionResult> {
      if (!request.subject || request.subject.trim() === '') {
        throw new Error('provision requires a non-empty OIDC subject');
      }

      const existing = await lookup(request.subject);
      let outcome: 'created' | 'existing' = 'existing';
      let tenant = existing;

      if (!tenant) {
        await insertTenant(request);
        // Re-read regardless of who won a concurrent insert race.
        tenant = await lookup(request.subject);
        if (!tenant) {
          throw new Error('tenant provisioning insert did not converge');
        }
        outcome = 'created';
      }

      // Idempotent in both modes: plan mode is pure; execute mode PUTs the
      // same attribute values on every call.
      const keycloakResult = await keycloak.applyTenantAttributes(request.subject, {
        tenantId: tenant.tenantId,
        tenantSlug: tenant.tenantSlug,
      });

      return {
        outcome,
        tenant,
        keycloak: keycloakResult,
        credentials: CREDENTIALS_DEFERRED,
      };
    },
  };
}
