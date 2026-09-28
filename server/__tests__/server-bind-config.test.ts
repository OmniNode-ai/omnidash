import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServerBindConfig } from '../data-source-contract';

const paths: string[] = [];
function fixture(host = ''): { base: string; overlay: string } {
  const path = mkdtempSync(join(tmpdir(), 'omnidash-bind-test-'));
  paths.push(path);
  const base = join(path, 'contract.yaml');
  writeFileSync(base, `server:\n  bind_host: "${host}"\n`);
  return { base, overlay: join(path, 'contract.local.yaml') };
}
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true }); });

describe('typed loopback server bind configuration', () => {
  it('preserves the normal default when no explicit host is declared', () => {
    const { base, overlay } = fixture();
    expect(loadServerBindConfig(base, overlay, {})).toEqual({ host: undefined });
  });
  it('loads a local overlay and accepts an explicit loopback env override', () => {
    const { base, overlay } = fixture();
    writeFileSync(overlay, 'server:\n  bind_host: "127.0.0.1"\n');
    expect(loadServerBindConfig(base, overlay, {})).toEqual({ host: '127.0.0.1' });
    expect(loadServerBindConfig(base, overlay, { OMNIDASH_BIND_HOST: '::1' })).toEqual({ host: '::1' });
  });
  it.each(['0.0.0.0', '::', 'localhost', '192.168.1.201', 'private-input.invalid', '127.0.0.1 '])(
    'refuses a nonliteral or nonloopback declared host %s without leaking it', (host) => {
      const { base, overlay } = fixture(host);
      expect(() => loadServerBindConfig(base, overlay, {}))
        .toThrow('server.bind_host must be an explicit loopback address');
    },
  );
  it('does not silently accept an empty explicit env override', () => {
    const { base, overlay } = fixture('127.0.0.1');
    expect(() => loadServerBindConfig(base, overlay, { OMNIDASH_BIND_HOST: '' })).toThrow();
  });
});
