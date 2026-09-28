import { createHmac } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { cookieSessionId, envFile, privateFile, proveBrowserLogin, safeDiagnostic } from './prove-sim-preflight-browser-login.js';

describe('browser login proof guards', () => {
  it('requires 0600 private inputs and refuses duplicate keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnidash-proof-'));
    const path = join(dir, 'credentials.env');
    writeFileSync(path, 'SIM_PREFLIGHT_DEMO_USERNAME=demo\nSIM_PREFLIGHT_DEMO_PASSWORD=pass\n', { mode: 0o600 });
    expect(envFile(path)).toMatchObject({ SIM_PREFLIGHT_DEMO_USERNAME: 'demo' });
    chmodSync(path, 0o644);
    expect(() => privateFile(path)).toThrow('private_input_required');
    chmodSync(path, 0o600);
    writeFileSync(path, 'A=value\nA=value\n', { mode: 0o600 });
    expect(() => envFile(path)).toThrow('invalid_private_input');
  });

  it('accepts generator-shaped launch env files with intentionally empty disabled settings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnidash-proof-launch-'));
    const path = join(dir, 'launch.env');
    writeFileSync(path, [
      'KEYCLOAK_ISSUER=http://auth.localhost:28080/realms/omninode',
      'SESSION_STORE_URL=redis://:private@127.0.0.1:65379/0',
      'OMNIDASH_RUNTIME_EDGE_URL=',
      'OMNIDASH_ONBOARDING_ENABLED=false',
    ].join('\n'), { mode: 0o600 });
    expect(envFile(path)).toMatchObject({ OMNIDASH_RUNTIME_EDGE_URL: '', OMNIDASH_ONBOARDING_ENABLED: 'false' });
  });

  it('refuses a symlinked private bundle root before reading inputs or launching a browser', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'omnidash-proof-root-'));
    const bundle = join(parent, 'bundle');
    const link = join(parent, 'bundle-link');
    mkdirSync(bundle, { mode: 0o700 });
    symlinkSync(bundle, link);

    await expect(proveBrowserLogin(link, join(parent, 'unused-launch.env'))).rejects.toThrow('private_bundle_required');
  });

  it('accepts only a correctly signed own connect.sid cookie', () => {
    const sessionId = 'own-session-id';
    const secret = 'session-secret';
    const signature = createHmac('sha256', secret).update(sessionId).digest('base64').replace(/=+$/, '');
    expect(cookieSessionId([{ name: 'connect.sid', value: `s:${sessionId}.${signature}` }], secret)).toBe(sessionId);
    expect(cookieSessionId([{ name: 'connect.sid', value: encodeURIComponent(`s:${sessionId}.${signature}`) }], secret)).toBe(sessionId);
    expect(() => cookieSessionId([{ name: 'connect.sid', value: `s:${sessionId}.tampered` }], secret)).toThrow('invalid_session_cookie');
  });

  it('never echoes raw diagnostics', () => {
    const diagnostic = safeDiagnostic(new Error('net::ERR_CONNECTION_REFUSED https://secret.example/?token=nope'));
    expect(diagnostic).toEqual({ stage: 'inputs', refusal: 'network_unavailable' });
    expect(JSON.stringify(diagnostic)).not.toContain('secret');
  });
});
