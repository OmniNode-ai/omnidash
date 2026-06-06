import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDataSourceConfig, loadRuntimeContract } from '../data-source-contract.js';

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
    expect(cfg.mode).toBe('postgres');
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

  it('deep-merges contract.local.yaml over contract.yaml without resetting unrelated defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnidash-contract-'));
    try {
      const basePath = join(dir, 'contract.yaml');
      const overlayPath = join(dir, 'contract.local.yaml');
      writeFileSync(basePath, `
data_source:
  default: postgres
  url: "http://base:3002"
  ws_url: "ws://base:3002/ws"
  sqlite_db_path: "~/.omninode/delegation/delegation.sqlite"
event_bus:
  bootstrap_servers: ""
  client_id: "omnidash-server"
`);
      writeFileSync(overlayPath, `
event_bus:
  bootstrap_servers: "192.168.86.201:39092"
`);

      const cfg = loadRuntimeContract(basePath, overlayPath);

      expect(cfg.data_source.default).toBe('postgres');
      expect(cfg.data_source.url).toBe('http://base:3002');
      expect(cfg.event_bus.bootstrap_servers).toBe('192.168.86.201:39092');
      expect(cfg.event_bus.client_id).toBe('omnidash-server');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not use legacy KAFKA_BROKERS in the producer config path', () => {
    const source = readFileSync(join(process.cwd(), 'server', 'kafka-producer.ts'), 'utf8');
    expect(source).not.toContain('KAFKA_BROKERS');
  });
});
