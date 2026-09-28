import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, statSync, rmSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSimPreflightLaunch } from './prepare-sim-preflight-launch';

const paths: string[] = [];
function fixture(): string {
  const path = mkdtempSync(join(tmpdir(), 'omnidash-launch-test-'));
  paths.push(path);
  writeFileSync(join(path, 'omnidash.env'),
    'KEYCLOAK_ISSUER=http://auth.localhost:28080/realms/omninode\nKEYCLOAK_CLIENT_ID=omnidash\nKEYCLOAK_CLIENT_SECRET=fixture-only-secret\nSESSION_SECRET=fixture-only-session\n', { mode: 0o600 });
  writeFileSync(join(path, 'credentials.env'),
    'ROLE_OMNIDASH_PASSWORD=fixture-only-password\nVALKEY_PASSWORD=fixture-only-password\n', { mode: 0o600 });
  return path;
}
afterEach(() => { vi.restoreAllMocks(); for (const path of paths.splice(0)) rmSync(path, { recursive: true }); });

describe('offline isolated OmniDash launch preparation', () => {
  it('refuses symlink input files and output parent directories', () => {
    const path = fixture();
    const input = join(path, 'credentials.env');
    renameSync(input, `${input}.real`);
    symlinkSync(`${input}.real`, input);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_input_required');
    const other = fixture();
    const alias = join(other, 'alias');
    symlinkSync(path, alias);
    expect(() => prepareSimPreflightLaunch(other, join(alias, 'launch.env'))).toThrow('private_output_required');
    expect(() => prepareSimPreflightLaunch(alias, join(other, 'launch.env'))).toThrow('private_bundle_required');
  });
  it('refuses foreign-owned private directories and files', () => {
    const path = fixture();
    const uid = process.getuid!();
    const owner = vi.spyOn(process, 'getuid');
    owner.mockReturnValue(uid + 1);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_output_required');
    owner.mockReset().mockReturnValue(uid + 1).mockReturnValueOnce(uid).mockReturnValueOnce(uid);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_input_required');
    owner.mockReset().mockReturnValue(uid + 1).mockReturnValueOnce(uid);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_bundle_required');
  });
  it('uses only local clone endpoints and readonly role, preserving the ordinary auth audience', () => {
    const path = fixture();
    const target = join(path, 'launch.env');
    expect(prepareSimPreflightLaunch(path, target).status).toBe('prepared_offline');
    const data = readFileSync(target, 'utf8');
    expect(data).toContain('@127.0.0.1:65036/omnidash_analytics?options=-c%20default_transaction_read_only%3Don');
    expect(data).toContain('OMNIDASH_BASE_URL=http://localhost:3000\n');
    expect(data).toContain('OMNIDASH_BIND_HOST=127.0.0.1\n');
    expect(data).toContain('OMNIDASH_OIDC_AUDIENCE=omnidash\n');
    expect(data).toContain('OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED=false\n');
    expect(data).toContain('OMNIDASH_ONBOARDING_ENABLED=false\n');
    expect(data).not.toContain('auth.omninode.ai');
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(() => prepareSimPreflightLaunch(path, target)).toThrow();
  });
  it('refuses absent secrets and wrong or external auth realm without revealing input', () => {
    const path = fixture();
    writeFileSync(join(path, 'omnidash.env'), 'KEYCLOAK_ISSUER=https://external.invalid/private-secret\n');
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('isolated_auth_required');
    writeFileSync(join(path, 'omnidash.env'),
      'KEYCLOAK_ISSUER=http://auth.localhost:28080/realms/omninode\nKEYCLOAK_CLIENT_ID=omnidash\n');
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_auth_input_required');
  });
  it('refuses non-private inputs and output directories and duplicate keys', () => {
    const path = fixture();
    chmodSync(join(path, 'credentials.env'), 0o644);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_input_required');
    chmodSync(join(path, 'credentials.env'), 0o600);
    chmodSync(path, 0o755);
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('private_output_required');
    chmodSync(path, 0o700);
    writeFileSync(join(path, 'credentials.env'), 'VALKEY_PASSWORD=not-public-value\nVALKEY_PASSWORD=not-public-value\n');
    expect(() => prepareSimPreflightLaunch(path, join(path, 'launch.env'))).toThrow('invalid_private_input');
  });
});
