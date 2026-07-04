// @vitest-environment node
import { describe, it, expect } from 'vitest';
import type { AuthConfig } from '../data-source-contract.js';
import { createKeycloakTokenVerifier, extractTenantId } from './oidc-token.js';

const baseConfig: AuthConfig = {
  tenantMode: 'required',
  issuerUrl: 'https://auth.example.test/realms/omninode',
  audience: '',
  tenantClaim: 'tenant_id',
};

describe('extractTenantId', () => {
  it('returns the tenant claim when it is a non-empty string', () => {
    expect(extractTenantId({ tenant_id: 'tenant-a' }, 'tenant_id')).toBe('tenant-a');
  });

  it('supports a configurable claim name', () => {
    expect(extractTenantId({ org_id: 'org-1' }, 'org_id')).toBe('org-1');
  });

  it('fails closed on absent, empty, or non-string claims', () => {
    expect(extractTenantId({}, 'tenant_id')).toBeNull();
    expect(extractTenantId({ tenant_id: '' }, 'tenant_id')).toBeNull();
    expect(extractTenantId({ tenant_id: '   ' }, 'tenant_id')).toBeNull();
    expect(extractTenantId({ tenant_id: 42 }, 'tenant_id')).toBeNull();
    expect(extractTenantId({ tenant_id: ['tenant-a'] }, 'tenant_id')).toBeNull();
    expect(extractTenantId({ tenant_id: null }, 'tenant_id')).toBeNull();
  });
});

describe('createKeycloakTokenVerifier', () => {
  it('refuses to construct without an issuer (fail fast at boot)', () => {
    expect(() => createKeycloakTokenVerifier({ ...baseConfig, issuerUrl: '' })).toThrow(
      /issuer_url/,
    );
  });

  it('constructs a verifier bound to the realm JWKS for a valid issuer', () => {
    const verify = createKeycloakTokenVerifier(baseConfig);
    expect(typeof verify).toBe('function');
  });

  it('rejects a garbage token without hitting the network', async () => {
    const verify = createKeycloakTokenVerifier(baseConfig);
    // Structurally invalid JWTs fail in jose before any JWKS fetch.
    await expect(verify('not-a-jwt')).rejects.toThrow();
  });
});
