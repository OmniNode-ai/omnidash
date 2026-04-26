/**
 * Tests for the scanInstalledPackages() function in generate-registry.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanInstalledPackages } from './generate-registry.js';
import type { ComponentManifest } from '../shared/types/component-manifest.js';

const VALID_MANIFEST: ComponentManifest = {
  name: 'test-widget',
  displayName: 'Test Widget',
  description: 'A test widget from an installed package',
  category: 'metrics',
  version: '1.0.0',
  implementationKey: 'test/TestWidget',
  configSchema: { type: 'object', properties: {}, additionalProperties: false },
  dataSources: [],
  events: { emits: [], consumes: [] },
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 12, h: 8 },
  emptyState: { message: 'No data', hint: 'Connect a data source' },
  capabilities: { supports_compare: false, supports_export: false, supports_fullscreen: false },
};

describe('scanInstalledPackages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'omni-registry-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty array when @omninode scope dir does not exist', () => {
    const result = scanInstalledPackages(tempDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when @omninode dir is empty', () => {
    mkdirSync(path.join(tempDir, '@omninode'));
    const result = scanInstalledPackages(tempDir);
    expect(result).toEqual([]);
  });

  it('skips packages without package.json', () => {
    mkdirSync(path.join(tempDir, '@omninode', 'no-pkg-json'), { recursive: true });
    const result = scanInstalledPackages(tempDir);
    expect(result).toEqual([]);
  });

  it('skips packages without dashboardComponents field', () => {
    const pkgDir = path.join(tempDir, '@omninode', 'plain-pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@omninode/plain-pkg', version: '1.0.0' }),
    );
    const result = scanInstalledPackages(tempDir);
    expect(result).toEqual([]);
  });

  it('scans a package with dashboardComponents and returns manifests with _sourcePackage set', () => {
    const pkgDir = path.join(tempDir, '@omninode', 'test-widgets');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@omninode/test-widgets',
        version: '2.0.0',
        dashboardComponents: './manifest.json',
      }),
    );
    writeFileSync(
      path.join(pkgDir, 'manifest.json'),
      JSON.stringify([VALID_MANIFEST]),
    );

    const result = scanInstalledPackages(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('test-widget');
    expect((result[0] as ComponentManifest & { _sourcePackage: string })._sourcePackage).toBe(
      '@omninode/test-widgets',
    );
  });

  it('warns and skips when dashboardComponents path points to a missing file', () => {
    const pkgDir = path.join(tempDir, '@omninode', 'broken-pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@omninode/broken-pkg',
        version: '1.0.0',
        dashboardComponents: './does-not-exist.json',
      }),
    );

    const result = scanInstalledPackages(tempDir);
    expect(result).toEqual([]);
  });

  it('scans multiple packages and returns all their manifests', () => {
    for (const [pkgName, manifestName] of [
      ['pkg-a', 'widget-a'],
      ['pkg-b', 'widget-b'],
    ]) {
      const pkgDir = path.join(tempDir, '@omninode', pkgName!);
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({
          name: `@omninode/${pkgName}`,
          version: '1.0.0',
          dashboardComponents: './manifest.json',
        }),
      );
      writeFileSync(
        path.join(pkgDir, 'manifest.json'),
        JSON.stringify([{ ...VALID_MANIFEST, name: manifestName }]),
      );
    }

    const result = scanInstalledPackages(tempDir);
    expect(result).toHaveLength(2);
    const names = result.map((m) => m.name).sort();
    expect(names).toEqual(['widget-a', 'widget-b']);
  });
});
