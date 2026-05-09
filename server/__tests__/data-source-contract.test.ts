import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadDataSourceConfig } from '../data-source-contract.js';

describe('loadDataSourceConfig', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OMNIDASH_DATA_SOURCE = process.env.OMNIDASH_DATA_SOURCE;
    savedEnv.OMNIDASH_BRIDGE_URL = process.env.OMNIDASH_BRIDGE_URL;
    savedEnv.OMNIDASH_SQLITE_DB_PATH = process.env.OMNIDASH_SQLITE_DB_PATH;
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
    delete process.env.OMNIDASH_SQLITE_DB_PATH;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns contract.yaml defaults when no env vars are set', () => {
    const cfg = loadDataSourceConfig();
    expect(cfg.mode).toBe('sqlite');
    expect(cfg.url).toBe('http://localhost:3002');
    expect(cfg.wsUrl).toBe('ws://localhost:3002/ws');
    expect(cfg.sqliteDbPath).toMatch(/\.omninode[/\\]delegation[/\\]delegation\.sqlite$/);
  });

  it('honors OMNIDASH_DATA_SOURCE env override', () => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    const cfg = loadDataSourceConfig();
    expect(cfg.mode).toBe('postgres');
  });

  it('honors OMNIDASH_BRIDGE_URL env override', () => {
    process.env.OMNIDASH_BRIDGE_URL = 'http://custom-host:3002';
    const cfg = loadDataSourceConfig();
    expect(cfg.url).toBe('http://custom-host:3002');
  });

  it('honors OMNIDASH_SQLITE_DB_PATH env override', () => {
    process.env.OMNIDASH_SQLITE_DB_PATH = '/tmp/test.sqlite';
    const cfg = loadDataSourceConfig();
    expect(cfg.sqliteDbPath).toBe('/tmp/test.sqlite');
  });

  it('expands tilde in sqlite_db_path', () => {
    const cfg = loadDataSourceConfig();
    expect(cfg.sqliteDbPath).not.toMatch(/^~/);
    expect(cfg.sqliteDbPath).toMatch(/\.omninode/);
  });
});
